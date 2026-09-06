#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ESP32Servo.h>

// --- HARDWARE PINS ---
const int LED_GREEN = 17;
const int LED_YELLOW = 16;
const int LED_RED = 4;
const int TRIG_PIN = 12;
const int ECHO_PIN = 14;
const int SERVO_PIN = 15;

// --- NETWORK & MQTT CONFIGURATION ---
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "100.107.9.36"; 

const char* topic_control = "city/ems/trafficlight1/cmd"; 
const char* topic_status = "city/ems/trafficlight1/status";   

WiFiClient espClient;
PubSubClient client(espClient);
Servo gateServo;

String cloudCommand = "Red"; // Default fallback state

// --- FINITE STATE MACHINE (FSM) DEFINITION ---
// Using FSM to ensure clean separation of concerns and deterministic behavior
enum IntersectionState {
  NORMAL_GREEN,
  NORMAL_RED,
  GREEN_WAVE,
  PEDESTRIAN_BLOCK
};

IntersectionState currentState = NORMAL_GREEN; 

// --- NON-BLOCKING TIMERS ---
unsigned long lastMqttPublishTime = 0;
unsigned long lastTrafficLightChangeTime = 0; 
unsigned long lastReconnectAttempt = 0; // Timer aggiunto per la riconnessione sicura

// --- MQTT CALLBACK ---
void callback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.print("[MQTT] Cloud command received: ");
  Serial.println(message);
  
  cloudCommand = message; 
}

void setup() {
  Serial.begin(115200);

  // Pin Configuration
  pinMode(LED_RED, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  
  gateServo.attach(SERVO_PIN);
  gateServo.write(0); // Gate closed by default for safety

  // Wi-Fi Connection
  Serial.println("[Network] Connecting to Wi-Fi (Wokwi-GUEST)...");
  WiFi.begin(ssid, password); 
  while (WiFi.status() != WL_CONNECTED) {
    digitalWrite(LED_YELLOW, HIGH);
    delay(250);
    digitalWrite(LED_YELLOW, LOW);
    delay(250);
    Serial.print(".");
  }
  
  Serial.println("\n[Network] Connected to Wi-Fi successfully!");
  
  // Boot-up visual feedback
  digitalWrite(LED_GREEN, HIGH);
  delay(1000);
  digitalWrite(LED_GREEN, LOW);

  // MQTT Setup
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback); 
  
  // Initialize FSM timer to ensure correct startup timing
  lastTrafficLightChangeTime = millis();
}

// RICONNESSIONE NON BLOCCANTE (Safety Resilience)
boolean reconnect() {
  Serial.print("[MQTT] Attempting connection via Tailscale...");
  String clientId = "ESP32_EdgeNode_";
  clientId += String(esp_random(), HEX);
  
  if (client.connect(clientId.c_str())) {
    Serial.println(" Connected!");
    client.subscribe(topic_control);
    return true;
  } else {
    Serial.print(" Failed, rc=");
    Serial.print(client.state());
    Serial.println(" - Will retry in background");
    return false;
  }
}

void loop() {
  unsigned long currentTime = millis();

  // 1. NETWORK KEEPALIVE (NON-BLOCKING)
  // Se cade la VPN, il semaforo continua a funzionare!
  if (!client.connected()) {
    if (currentTime - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = currentTime;
      if (reconnect()) {
        lastReconnectAttempt = 0;
      }
    }
  } else {
    client.loop(); 
  }

  // 2. SENSOR PERCEPTION (Local Context)
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // 30ms timeout prevents the ESP32 from freezing if no echo is received
  long duration = pulseIn(ECHO_PIN, HIGH, 30000); 
  
  int distance = 0;
  if (duration > 0) {
    distance = duration * 0.034 / 2;
  }

  // Check for obstacle/pedestrian within 10 meters
  bool pedestrianDetected = (distance > 0 && distance < 10);
  
  // Check if backend is requesting pre-emption
  bool emergencyRequested = (cloudCommand.indexOf("green_wave") != -1);

  // 3. FSM LOGIC (The "Brain")
  
  // A. LOGICA DI EMERGENZA (Onda Verde attiva)
  if (emergencyRequested) {
    // Durante l'Onda Verde, il sensore pedonale agisce come SALVAVITA
    if (pedestrianDetected) {
      if (currentState != PEDESTRIAN_BLOCK) {
        Serial.println("[FSM] Green Wave ABORTED! Pedestrian on crosswalk. Engaging Safety Block.");
      }
      currentState = PEDESTRIAN_BLOCK;
    } 
    // Se non ci sono pedoni, via libera all'ambulanza
    else {
      if (currentState != GREEN_WAVE) {
        Serial.println("[FSM] Green Wave Activated! Priority given to EMS.");
      }
      currentState = GREEN_WAVE;
    }
    // Mantieni aggiornato il timer per non sballare i cicli dopo l'emergenza
    lastTrafficLightChangeTime = currentTime; 
  } 
  
  // B. LOGICA DI TRAFFICO CIVILE NORMALE (Nessuna emergenza)
  else {
    // Se l'emergenza è appena finita, scatta subito il ROSSO per far defluire il traffico incrociato
    if (currentState == GREEN_WAVE || currentState == PEDESTRIAN_BLOCK) {
      Serial.println("[FSM] EMS passed. Switching to RED to allow cross-traffic.");
      currentState = NORMAL_RED;
      lastTrafficLightChangeTime = currentTime;
    }
    
    
    if (currentState == NORMAL_GREEN && (currentTime - lastTrafficLightChangeTime >= 8000)) {
      Serial.println("[FSM] Timer expired: Switching to RED.");
      currentState = NORMAL_RED;
      lastTrafficLightChangeTime = currentTime;
    } 
    else if (currentState == NORMAL_RED && (currentTime - lastTrafficLightChangeTime >= 12000)) {
      Serial.println("[FSM] Timer expired: Switching to GREEN.");
      currentState = NORMAL_GREEN;
      lastTrafficLightChangeTime = currentTime;
    }
  }

  // 4. ACTUATION (The "Muscles")
  String currentLightStatus = "Red"; 
  
  switch (currentState) {
    
    case NORMAL_GREEN:
    case GREEN_WAVE: 
      // Both states physically open the intersection
      digitalWrite(LED_RED, LOW);
      digitalWrite(LED_YELLOW, LOW);
      digitalWrite(LED_GREEN, HIGH);
      gateServo.write(90); // Open gate
      currentLightStatus = "Green";
      break;
      
    case NORMAL_RED:
      digitalWrite(LED_RED, HIGH);
      digitalWrite(LED_YELLOW, LOW);
      digitalWrite(LED_GREEN, LOW);
      gateServo.write(0); // Close gate
      currentLightStatus = "Red";
      break;

    case PEDESTRIAN_BLOCK:
      digitalWrite(LED_GREEN, LOW);
      // If emergency is active but a pedestrian is detected, turn on Yellow as a warning
      digitalWrite(LED_YELLOW, HIGH); 
      digitalWrite(LED_RED, HIGH);
      gateServo.write(0); 
      currentLightStatus = "Blocked_by_Pedestrian";
      break;
  }

  // 5. ASYNCHRONOUS MQTT PUBLISHING (Telemetry every 1 second)
  if (currentTime - lastMqttPublishTime >= 1000) {
    lastMqttPublishTime = currentTime; 
    
    // Invia lo stato del pedone solo se effettivamente è in corso un blocco emergenziale
    String pedStatus = (currentState == PEDESTRIAN_BLOCK) ? "true" : "false";
    
    // JSON Payload matching the backend schema
    String payload = "{\"power_status\": \"ON\", \"Pedestrian_detected\": " + pedStatus + ", \"Light_State\": \"" + currentLightStatus + "\"}";
    
    client.publish(topic_status, payload.c_str());
  }
}
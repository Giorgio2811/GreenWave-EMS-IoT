
const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://100.107.9.36:1883");

// Topic di PUBBLICAZIONE dati del traffico
const topicTraffico = 'city/ems/trafficlight1/queue';

// Topic di ASCOLTO comandi che il Cloud manda al semaforo
const topicControl = 'city/ems/trafficlight1/cmd';

let macchineInCoda = 10; 
let ondaVerdeAttiva = false; 

client.on('connect', () => {
    console.log("AI Traffic Camera ONLINE: Inizio monitoraggio incrocio...");
    
    // Ci iscriviamo al canale di comando per origliare
    client.subscribe(topicControl);
    
    // Ogni 3 secondi calcoliamo il traffico
    setInterval(() => {
        let variazione = 0;

        if (ondaVerdeAttiva === true) {
            // MODALITÀ EMERGENZA (Semaforo Forzato Verde)
            variazione = -(Math.floor(Math.random() * 3) + 2); 
            console.log("🚨 ONDA VERDE: Deflusso lento in corso...");
        } else {
            // MODALITÀ NORMALE (Ciclo semaforico standard)
            variazione = Math.floor(Math.random() * 6) - 2; 
        }

        macchineInCoda += variazione;
        
        // Limiti fisici (minimo 0 auto, massimo 40)
        if (macchineInCoda < 0) macchineInCoda = 0;
        if (macchineInCoda > 40) macchineInCoda = 40;
        
        // Classificazione
        let livelloCongestione = "Basso";
        if (macchineInCoda >= 15) livelloCongestione = "Medio";
        if (macchineInCoda >= 28) livelloCongestione = "Alto";
        
        const payload = {
            sensor_id: "Cam_Sturla_01",
            cars_waiting: macchineInCoda,
            traffic_status: livelloCongestione
        };
        
        client.publish(topicTraffico, JSON.stringify(payload));
        
        console.log(`[Telecamera] Inviato -> Auto: ${macchineInCoda} | Congestione: ${livelloCongestione}`);
        
    }, 2000); 
});


client.on('message', (topic, message) => {
    const comando = message.toString();
    
    if (topic === topicControl) {
        if (comando.includes("green_wave")) {
            ondaVerdeAttiva = true;
        } else {
            // Se Node-RED manda qualsiasi altra cosa (es. "red" o "normal") l'emergenza finisce
            ondaVerdeAttiva = false;
        }
    }
});

client.on('error', (err) => console.error("MQTT Error:", err));
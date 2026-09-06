const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://100.107.9.36:1883");

const topicAmbulanza = 'city/ems/ambulance1/gps';
const topicStatusSemaforo = 'city/ems/trafficlight1/status'; 

const pPartenza = { lat: 44.4075, lon: 8.9772 }; 
const pIncrocio = { lat: 44.3995, lon: 8.9851 }; 
const pArrivo   = { lat: 44.3915, lon: 8.9930 }; 

let stepAttuale = 0;
const stepTotaliTratta = 30; 
let bloccoPedone = false; // Gli occhi del pilota

// Il pilota ascolta lo stato del semaforo
client.on('message', (topic, message) => {
    if (topic === topicStatusSemaforo) {
        try {
            const telemetriaSemaforo = JSON.parse(message.toString());
            // Se l'ESP32 segnala il blocco pedone, il pilota lo vede
            if (telemetriaSemaforo.Light_State === "Blocked_by_Pedestrian") {
                bloccoPedone = true;
            } else {
                bloccoPedone = false;
            }
        } catch (e) {
            console.error("Errore di decodifica JSON dal semaforo");
        }
    }
});

client.on('connect', () => {
    console.log("Code Red: Ambulance departing for the accident scene...");
    
    // Iscrizione per "guardare" il semaforo
    client.subscribe(topicStatusSemaforo);
    
    const interval = setInterval(() => {
        
        // --- FASE DI AVVICINAMENTO ALL'INCROCIO ---
        if (stepAttuale <= stepTotaliTratta) {
            
            let percentuale = stepAttuale / stepTotaliTratta;
            let currentLat = pPartenza.lat + ((pIncrocio.lat - pPartenza.lat) * percentuale);
            let currentLon = pPartenza.lon + ((pIncrocio.lon - pPartenza.lon) * percentuale);
            
            // LOGICA DEL PILOTA: Se c'è un pedone e NON ho ancora attraversato, freno!
            if (bloccoPedone) {
                console.log(`EMERGENCY BRAKING: Pedone sulle strisce! Ambulanza in attesa...`);
                // Pubblica la posizione da fermo per far sapere a Node-RED che è lì
                const payloadFermo = {
                    siren_active: true,  
                    latitude: Number.parseFloat(currentLat.toFixed(4)), 
                    longitude: Number.parseFloat(currentLon.toFixed(4))
                };
                client.publish(topicAmbulanza, JSON.stringify(payloadFermo));
                return; // Esce dalla funzione senza fare stepAttuale++, così il mezzo NON si muove.
            }

            const payload = {
                siren_active: true,  
                latitude: Number.parseFloat(currentLat.toFixed(4)), 
                longitude: Number.parseFloat(currentLon.toFixed(4))
            };

            client.publish(topicAmbulanza, JSON.stringify(payload));
            console.log(`[Approaching] Step ${stepAttuale} - GPS: ${payload.latitude}, ${payload.longitude}`);
            
            if (stepAttuale === stepTotaliTratta) console.log(">>> Crossing the intersection right now! <<<");
            
            stepAttuale++;
        } 
        // --- FASE DI ALLONTANAMENTO (Distanza > 0) ---
        else if (stepAttuale <= (stepTotaliTratta * 2)) {
            
            let stepAllontanamento = stepAttuale - stepTotaliTratta;
            let percentuale = stepAllontanamento / stepTotaliTratta;
            
            let currentLat = pIncrocio.lat + ((pArrivo.lat - pIncrocio.lat) * percentuale);
            let currentLon = pIncrocio.lon + ((pArrivo.lon - pIncrocio.lon) * percentuale);
            
            // Qui non c'è l'if (bloccoPedone)! Se il pedone passa ora, l'ambulanza tira dritto.
            const payload = {
                siren_active: true, 
                latitude: Number.parseFloat(currentLat.toFixed(4)), 
                longitude: Number.parseFloat(currentLon.toFixed(4))
            };

            client.publish(topicAmbulanza, JSON.stringify(payload));
            console.log(`[Departing] Step ${stepAttuale} - GPS: ${payload.latitude}, ${payload.longitude}`);

            stepAttuale++;
        } 
        // --- FASE DI ARRIVO ---
        else {
            console.log("Ambulance arrived at the scene! Sending termination signal...");
            
            const payloadFinale = {
                siren_active: false, 
                status: "arrived_at_scene",
                latitude: pArrivo.lat, 
                longitude: pArrivo.lon
            };
            
            client.publish(topicAmbulanza, JSON.stringify(payloadFinale));
            
            clearInterval(interval); 
            setTimeout(() => { client.end(); }, 1000);
        }
        
    }, 1000); 
});

client.on('error', (err) => console.error("MQTT Error:", err));
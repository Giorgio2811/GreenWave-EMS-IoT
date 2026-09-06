
const mqtt = require("mqtt");
const client = mqtt.connect("mqtt://100.107.9.36:1883");

const topicAmbulanza = 'city/ems/ambulance1/gps';
const topicStatusSemaforo = 'city/ems/trafficlight1/status'; 

const pPartenza = { lat: 44.3915, lon: 8.9930 }; 
const pIncrocio = { lat: 44.3995, lon: 8.9851 }; 
const pArrivo   = { lat: 44.4075, lon: 8.9772 }; 

let stepAttuale = 0;
const stepTotaliTratta = 30; 
let statoSemaforoAttuale = "Red"; 

client.on('connect', () => {
    console.log("Returning to base: Ambulance in motion (siren OFF)...");
    
    client.subscribe(topicStatusSemaforo);
    
    const interval = setInterval(() => {
        
        if (stepAttuale <= stepTotaliTratta) {
            
            let percentuale = stepAttuale / stepTotaliTratta;
            let currentLat = pPartenza.lat + ((pIncrocio.lat - pPartenza.lat) * percentuale);
            let currentLon = pPartenza.lon + ((pIncrocio.lon - pPartenza.lon) * percentuale);
            
            const payload = {
                siren_active: false,  
                latitude: Number.parseFloat(currentLat.toFixed(4)), 
                longitude: Number.parseFloat(currentLon.toFixed(4))
            };

            client.publish(topicAmbulanza, JSON.stringify(payload));
            
            // LOGICA DI STOP AL SEMAFORO (Mezzo Civile)
            if (stepAttuale === stepTotaliTratta) {
                if (statoSemaforoAttuale !== "Green") {
                    console.log(`[Attesa] Semaforo ${statoSemaforoAttuale}. Ambulanza ferma in coda...`);
                } else {
                    console.log(">>> Semaforo Verde! L'ambulanza civile riparte e attraversa. <<<");
                    stepAttuale++; 
                }
            } else {
                console.log(`[Return - Approaching] Step ${stepAttuale} (Civilian)`);
                stepAttuale++;
            }
            
        } 
        else if (stepAttuale <= (stepTotaliTratta * 2)) {
            
            let stepAllontanamento = stepAttuale - stepTotaliTratta;
            let percentuale = stepAllontanamento / stepTotaliTratta;
            
            let currentLat = pIncrocio.lat + ((pArrivo.lat - pIncrocio.lat) * percentuale);
            let currentLon = pIncrocio.lon + ((pArrivo.lon - pIncrocio.lon) * percentuale);
            
            const payload = {
                siren_active: false, 
                latitude: Number.parseFloat(currentLat.toFixed(4)), 
                longitude: Number.parseFloat(currentLon.toFixed(4))
            };

            client.publish(topicAmbulanza, JSON.stringify(payload));
            console.log(`[Return - Departing] Step ${stepAttuale}`);

            stepAttuale++;
        } 
        else {
            console.log("Ambulance returned to base. Shift concluded safely.");
            
            const payloadFinale = {
                siren_active: false,
                status: "returned_to_base",
                latitude: pArrivo.lat, 
                longitude: pArrivo.lon
            };
            
            client.publish(topicAmbulanza, JSON.stringify(payloadFinale));
            
            clearInterval(interval); 
            setTimeout(() => { client.end(); }, 1000);
        }
        
    }, 1000); 
});

client.on('message', (topic, message) => {
    if (topic === topicStatusSemaforo) {
        try {
            const datiSemaforo = JSON.parse(message.toString());
            if (datiSemaforo.Light_State) {
                statoSemaforoAttuale = datiSemaforo.Light_State;
            }
        } catch (e) {
            console.error("Errore di decodifica JSON dal semaforo");
        }
    }
});

client.on('error', (err) => console.error("MQTT Error:", err));
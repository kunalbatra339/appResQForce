// src/components/ClientPage.jsx (Updated with Offline Queueing Logic)
import React, { useState, useEffect } from 'react'; // No change needed
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'; // No change needed
import apiClient from '../api/axiosConfig'; // No change needed

// styles object (Unchanged)
const styles = {
    body: { fontFamily: "'Space Grotesk', sans-serif", backgroundColor: '#1a202c', color: '#e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', padding: '20px' },
    mapContainer: { height: '300px', width: '100%', maxWidth: '800px', marginBottom: '20px', borderRadius: '15px', boxShadow: '0 0 15px rgba(0, 0, 0, 0.4)' },
    reportBox: { width: '100%', maxWidth: '600px', padding: '30px', background: '#111', color: '#fff', borderRadius: '15px', boxShadow: '0 0 15px rgba(0, 0, 0, 0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
    title: { fontSize: '28px', color: '#2eccff', marginBottom: '15px', fontFamily: "'Orbitron', sans-serif", textAlign: 'center' },
    disclaimer: { fontSize: '14px', color: '#ccc', marginBottom: '25px', lineHeight: '1.5', textAlign: 'center' },
    inputBase: { width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #3498db', background: '#1e1e1e', color: 'white', fontSize: '16px', boxSizing: 'border-box' },
    textArea: { resize: 'vertical', minHeight: '100px' },
    severityGroup: { display: 'flex', justifyContent: 'space-around', gap: '10px', marginBottom: '20px', width: '100%' },
    severityButton: { flexGrow: 1, padding: '12px', borderRadius: '8px', border: '2px solid transparent', backgroundColor: '#374151', color: 'white', fontSize: '16px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.3s ease-in-out' },
    submitButton: { padding: '12px 24px', backgroundColor: '#e74c3c', border: 'none', borderRadius: '8px', color: 'white', fontSize: '18px', cursor: 'pointer', transition: 'background 0.3s', width: '100%', fontFamily: "'Orbitron', sans-serif" },
    messageBox: { marginTop: '20px', padding: '15px', borderRadius: '8px', fontSize: '16px', textAlign: 'center', width: '100%', boxSizing: 'border-box' },
    success: { backgroundColor: '#10b981', color: 'white' },
    error: { backgroundColor: '#ef4444', color: 'white' },
};

// MapUpdater component (Unchanged)
const MapUpdater = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
}

function ClientPage() {
    // State variables (Unchanged)
    const [tag, setTag] = useState('fire');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState('low');
    const [mobileNumber, setMobileNumber] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [mapState, setMapState] = useState({ position: [20.5937, 78.9629], zoom: 5 });
    const [reportedLocation, setReportedLocation] = useState(null);

    // displayMessage function (Unchanged)
    const displayMessage = (text, type) => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    // --- REPLACED: handleSubmit function with offline logic ---
    const handleSubmit = (event) => {
        event.preventDefault();

        // Validations (Unchanged)
        if (!description.trim()) { displayMessage('Please describe the emergency.', 'error'); return; }
        if (!mobileNumber.trim()) { displayMessage('Please enter a mobile number.', 'error'); return; }
        if (!/^\d{10}$/.test(mobileNumber)) { displayMessage('Please enter a valid 10-digit mobile number.', 'error'); return; }

        if (!navigator.geolocation) {
            displayMessage("Geolocation not supported.", 'error'); return;
        }

        displayMessage("Getting location...", "info");
        console.log("Requesting geolocation..."); // <-- Log 1

        navigator.geolocation.getCurrentPosition(
            // Success Callback (Location OK)
            async (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                console.log("Geolocation successful:", lat, lng); // <-- Log 2
                const reportData = { lat, lng, description, tag, severity, timestamp: new Date().toISOString() };
                const isOnline = navigator.onLine; // <-- Check status
                console.log("Network status check. Is online:", isOnline); // <-- Log 3

                if (isOnline) {
                    // ONLINE PATH
                    console.log("Attempting to send report online..."); // <-- Log 4
                    displayMessage("Sending report...", "info");
                    try {
                        await apiClient.post('/report_emergency', reportData);
                        console.log("Online report sent successfully."); // <-- Log 5
                        displayMessage('Emergency reported successfully!', 'success');
                        // Reset form
                        setMapState({ position: [lat, lng], zoom: 15 });
                        setReportedLocation([lat, lng]);
                        setDescription(''); setSeverity('low'); setMobileNumber('');
                    } catch (err) {
                        console.error("Failed to report emergency online:", err); // <-- Log 6
                        displayMessage('Failed to send report. Check connection or try again.', 'error');
                        // Optional: Queue here too if online send fails
                        // queueReportOffline(reportData, lat, lng);
                    }
                } else {
                    // OFFLINE PATH
                    console.log("Attempting to queue report offline (location success)..."); // <-- Log 7
                    queueReportOffline(reportData, lat, lng); // Use helper function
                }
            },
            // Error Callback (Geolocation Failed)
            (geoError) => {
                console.error("Geolocation failed:", geoError.message); // <-- Log 10
                const isOnline = navigator.onLine; // Check network status *during* error
                console.log("Network status check during geo fail. Is online:", isOnline);

                if (!isOnline) {
                    // --- Allow queuing EVEN IF geolocation fails when offline ---
                    console.warn("Geolocation failed while offline. Queuing report without precise location.");
                    // Use placeholder coordinates or null
                    const placeholderLat = 20.5937; // Or null
                    const placeholderLng = 78.9629; // Or null
                    const reportData = {
                        lat: placeholderLat,
                        lng: placeholderLng,
                        description: `${description} (Location Accuracy Low - Reported Offline)`, // Add note
                        tag,
                        severity,
                        timestamp: new Date().toISOString()
                    };
                    queueReportOffline(reportData, placeholderLat, placeholderLng); // Use helper function
                } else {
                    // Geolocation failed while ONLINE - don't queue
                    displayMessage(`Could not get location: ${geoError.message}. Enable location access & try again.`, 'error');
                }
            },
            // Options
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } // Increased timeout slightly
        );
    };
    // --- END: handleSubmit replacement ---


    // --- ADDED: Helper function from second code block ---
    const queueReportOffline = (reportData, displayLat, displayLng) => {
         try {
            const queuedReports = JSON.parse(localStorage.getItem('queuedEmergencyReports') || '[]');
            queuedReports.push(reportData);
            localStorage.setItem('queuedEmergencyReports', JSON.stringify(queuedReports));
            console.log("Report queued successfully:", reportData); // <-- Log 8
            displayMessage('Offline. Report queued and will send when online.', 'info'); // <-- Check this message
            // Reset form
            // Use displayLat/Lng which might be placeholders if geo failed
            setMapState({ position: [displayLat, displayLng], zoom: 15 });
            setReportedLocation([displayLat, displayLng]);
            setDescription(''); setSeverity('low'); setMobileNumber('');
        } catch (storageError) {
            console.error("Failed to queue report locally:", storageError); // <-- Log 9
            displayMessage('Offline. Could not save report locally.', 'error');
        }
    };
    // --- END: Added helper function ---

    // Return statement JSX (Unchanged)
    return (
        <div style={styles.body}>
            <div style={styles.mapContainer}>
                <MapContainer center={mapState.position} zoom={mapState.zoom} style={{ height: '100%', width: '100%', borderRadius: '15px' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
                    {reportedLocation && <Marker position={reportedLocation}><Popup>Reported location</Popup></Marker>}
                    <MapUpdater center={mapState.position} zoom={mapState.zoom} />
                </MapContainer>
            </div>
            <div style={styles.reportBox}>
                <h3 style={styles.title}>🚨 Report Emergency</h3>
                <p style={styles.disclaimer}>For demonstration purposes only.</p>
                <form onSubmit={handleSubmit} style={{ width: '100%' }}>
                   {/* ... form elements ... */}
                    <select style={styles.inputBase} value={tag} onChange={(e) => setTag(e.target.value)}>
                        <option value="fire">🔥 Fire</option>
                        <option value="flood">🌊 Flood</option>
                        <option value="accident">🚨 Accident</option>
                        <option value="medical">⚕️ Medical</option>
                        <option value="natural_disaster">🌪️ Natural Disaster</option>
                        <option value="crime">🔪 Crime</option>
                        <option value="other">❓ Other</option>
                    </select>
                    <div style={styles.severityGroup}>
                        {['low', 'medium', 'high'].map((level) => (
                            <button type="button" key={level} onClick={() => setSeverity(level)}
                                style={{ ...styles.severityButton, borderColor: severity === level ? '#2eccff' : 'transparent' }}>
                                {level.charAt(0).toUpperCase() + level.slice(1)}
                            </button>
                        ))}
                    </div>
                    <input
                        type="tel"
                        style={styles.inputBase}
                        value={mobileNumber}
                        onChange={(e) => setMobileNumber(e.target.value)}
                        placeholder="Enter your mobile number"
                        required
                    />
                    <textarea style={{...styles.inputBase, ...styles.textArea}} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the emergency..." required />
                    <button type="submit" style={styles.submitButton}>Send Alert</button>
                </form>
                {message.text && <div style={{ ...styles.messageBox, ...(styles[message.type]) }}>{message.text}</div>}
            </div>
        </div>
    );
}

export default ClientPage;
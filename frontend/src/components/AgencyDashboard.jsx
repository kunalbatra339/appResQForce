// src/components/AgencyDashboard.jsx (Updated to use standard blue icons for all agencies)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosConfig';
import useAuth from '../hooks/useAuth';

import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';
import '../styling/AgencyDashboard.css';

// --- Icon definitions (REMOVED agencyIcons and createIcon) ---
// const createIcon = (svg, color) => L.divIcon({ ... });
// const agencyIcons = { ... };

// Emergency Icon (Unchanged)
const emergencyIcon = L.divIcon({
    className: 'emergency-marker',
    html: `<div style="background:rgba(192, 57, 43, 0.2); border:2px solid #c0392b; border-radius:50%; width:30px; height:30px; animation:pulse 1.5s infinite;"></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15]
});

// --- ADDED: Standard Blue Icon for ALL agencies on this dashboard ---
const standardAgencyBlueIcon = L.divIcon({
    className: 'custom-agency-icon-blue', // Consistent class name
    html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="25" height="25" fill="#3498db">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
});
// --- END: Added standard blue icon ---


// --- Haversine distance calculation (unchanged) ---
const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat)/2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon))/2;
    return R * 2 * Math.asin(Math.sqrt(a));
};

// --- FocusView component (unchanged) ---
const FocusView = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
        if (center) {
            map.setView(center, zoom);
        }
    }, [center, zoom, map]);
    return null;
};

// --- RoutingMachine component (unchanged) ---
const RoutingMachine = ({ start, end }) => {
    const map = useMap();
    useEffect(() => {
        if (!map || !start || !end) return;

        // --- ADDED: Define transparent icon ---
        const transparentIcon = L.icon({
             iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', // 1x1 transparent png
             iconSize: [1, 1],
             iconAnchor: [0, 0],
        });
        // --- END: Add transparent icon ---

        const routingControl = L.Routing.control({
            waypoints: [L.latLng(start[0], start[1]), L.latLng(end[0], end[1])],
            routeWhileDragging: false,
            // --- ADDED BACK: createMarker with transparent icon ---
            createMarker: function(i, waypoint, n) {
                 // Return a marker with the transparent icon
                 return L.marker(waypoint.latLng, {
                     icon: transparentIcon,
                     interactive: false // Make marker non-interactive
                 });
             },
            // --- END: createMarker modification ---
            lineOptions: { styles: [{ color: 'blue', opacity: 0.7, weight: 5 }] },
            show: false, addWaypoints: false,
            fitSelectedRoutes: false,
        }).addTo(map);
        // ... (rest of component remains the same)
        return () => {
             if (map && map.hasLayer(routingControl)) { // Corrected cleanup
                 map.removeControl(routingControl);
             }
        }
    }, [map, start, end]);
    return null;
};

function AgencyDashboard() {
    // --- State variables (unchanged) ---
    const [agencies, setAgencies] = useState([]);
    const [emergencies, setEmergencies] = useState([]);
    const [isAlertVisible, setAlertVisible] = useState(false);
    const [nearestEmergencyRoute, setNearestEmergencyRoute] = useState(null);
    const [mapFocusCenter, setMapFocusCenter] = useState(null);
    // --- ADDED: State for toggling auto-fit ---
    const [isAutoFitEnabled, setIsAutoFitEnabled] = useState(true);
    // --- END: Added state ---
    const emergenciesCount = useRef(0);
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const alertAudio = useRef(new Audio('https://assets.mixkit.co/sfx/preview/mixkit-alarm-digital-clock-beep-989.mp3'));
    const HIGH_ZOOM_LEVEL = 14;

    // --- fetchMapData (unchanged) ---
    const fetchMapData = useCallback(async (isInitialFetch = false) => {
        try {
            const [agenciesRes, emergenciesRes] = await Promise.all([
                apiClient.get('/agencies'), // Fetches role now
                apiClient.get('/emergencies')
            ]);
            if (!isInitialFetch && emergenciesRes.data.length > emergenciesCount.current) {
                setAlertVisible(true);
                alertAudio.current.play().catch(e => console.log("Audio play failed:", e));
            }
            setAgencies(agenciesRes.data);
            setEmergencies(emergenciesRes.data);
            emergenciesCount.current = emergenciesRes.data.length;
        } catch (error) {
            console.error("Failed to fetch map data:", error);
            if(error.response?.status === 401) {
                logout();
                navigate('/login');
            }
        }
    }, [logout, navigate]);

    // --- useEffect for fetching data (unchanged) ---
    useEffect(() => {
        fetchMapData(true);
        const intervalId = setInterval(() => fetchMapData(false), 5000);
        return () => clearInterval(intervalId);
    }, [fetchMapData]);

    // --- useEffect to calculate route and focus (unchanged) ---
    useEffect(() => {
        if (user && user.latitude && user.longitude) {
            setMapFocusCenter([user.latitude, user.longitude]);
            if (emergencies.length > 0) {
                let closestEmergency = null;
                let minDistance = Infinity;
                emergencies.forEach(emergency => {
                    // Ensure emergency has valid coordinates
                    if (emergency.latitude != null && emergency.longitude != null) {
                        const distance = getDistanceInKm(
                            user.latitude, user.longitude,
                            emergency.latitude, emergency.longitude
                        );
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestEmergency = emergency;
                        }
                    }
                });
                if (closestEmergency) {
                    setNearestEmergencyRoute({
                        start: [user.latitude, user.longitude],
                        end: [closestEmergency.latitude, closestEmergency.longitude],
                        key: `route-${user.id}-${closestEmergency._id}`
                    });
                } else {
                    setNearestEmergencyRoute(null);
                }
            } else {
                setNearestEmergencyRoute(null);
            }
        } else {
            setNearestEmergencyRoute(null);
            setMapFocusCenter(null);
        }
    }, [user, emergencies]);

    // --- handleUpdateLocation (unchanged) ---
    const handleUpdateLocation = () => {
        navigator.geolocation.getCurrentPosition(async (position) => {
            const { latitude: lat, longitude: lng } = position.coords;
            try {
                 await apiClient.post('/update_location', { lat, lng });
                 fetchMapData(false);
            } catch(error) {
                 console.error("Error updating location:", error);
            }
        }, (error) => {
             console.error("Geolocation error:", error);
             alert("Could not get your location. Please ensure location services are enabled.");
        });
    };

    // --- handleLogout (unchanged) ---
    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    // --- REMOVED: Find logged-in agency icon ---
    // const loggedInAgency = agencies.find(a => a._id === user?.id);
    // const loggedInAgencyIcon = loggedInAgency ? (agencyIcons[loggedInAgency.expertise] || agencyIcons.default) : agencyIcons.default;

    // --- ADDED: Function to toggle auto-fit state ---
    const toggleAutoFit = () => {
        setIsAutoFitEnabled(prevState => !prevState);
        console.log("AutoFit Toggled:", !isAutoFitEnabled); // Debug log
    };
    // --- END: Added toggle function ---


    return (
        <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
            {isAlertVisible && (
                <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#ff4444', color: 'white', padding: '15px 25px', borderRadius: '5px', zIndex: 2000, display: 'flex', alignItems: 'center' }}>
                    🚨 NEW EMERGENCY DETECTED! 🚨
                    <button onClick={() => setAlertVisible(false)} style={{ background: 'transparent', border: '1px solid white', color: 'white', marginLeft: '15px', cursor: 'pointer' }}>Dismiss</button>
                </div>
            )}

            {/* --- MODIFIED: Added Toggle Button to controls (unchanged from your code) --- */}
            <div className="controls-container-dashboard">
                <button onClick={handleUpdateLocation} className="update-location-button">📍 Update My Location</button>
                <button onClick={toggleAutoFit} className="toggle-autofit-button" title={isAutoFitEnabled ? "Disable Auto-Focus" : "Enable Auto-Focus"}>
                    {isAutoFitEnabled ? '🔄' : '🚫'}
                </button>
                <button onClick={handleLogout} className="logout-button">🚪 Logout</button>
            </div>
            {/* --- END: Controls modification --- */}

            <MapContainer center={mapFocusCenter || [20.5937, 78.9629]} zoom={HIGH_ZOOM_LEVEL} style={{ height: '100%', width: '100%', zIndex: 1 }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />

                {/* --- MODIFIED: Render other agencies (With NDRF filter - USES BLUE ICON) --- */}
                {agencies
                    .filter(agency => agency._id !== user?.id && agency.role !== 'ndrf')
                    .map(agency => (
                        <Marker
                            key={agency._id}
                            position={[agency.latitude, agency.longitude]}
                            icon={standardAgencyBlueIcon} // <-- Use standard blue icon
                        >
                            <Popup><b>{agency.name}</b><br/>{agency.expertise} Team</Popup>
                        </Marker>
                 ))}

                {/* --- MODIFIED: Render logged-in user's agency marker (With NDRF filter - USES BLUE ICON) --- */}
                 {user && user.role !== 'ndrf' && user.latitude && user.longitude && (
                     <Marker
                         key={user.id}
                         position={[user.latitude, user.longitude]}
                         icon={standardAgencyBlueIcon} // <-- Use standard blue icon
                     >
                          <Popup><b>Your Location</b><br/>{user.name}</Popup>
                     </Marker>
                 )}

                {/* --- Render emergencies (unchanged) --- */}
                {emergencies.map(emergency => (
                    (emergency.latitude != null && emergency.longitude != null) &&
                    <Marker key={emergency._id} position={[emergency.latitude, emergency.longitude]} icon={emergencyIcon}>
                        <Popup>
                            <b>{emergency.severity_display} Emergency</b><br/>
                            {emergency.description}<br/><br/>
                            <small>Reported: {new Date(emergency.created_at).toLocaleString()}</small>
                        </Popup>
                    </Marker>
                ))}

                {/* --- Render the route if available (unchanged) --- */}
                {nearestEmergencyRoute && (
                    <RoutingMachine
                        key={nearestEmergencyRoute.key}
                        start={nearestEmergencyRoute.start}
                        end={nearestEmergencyRoute.end}
                    />
                )}

                {/* --- MODIFIED: Conditionally render FocusView (unchanged from your code) --- */}
                {isAutoFitEnabled && <FocusView center={mapFocusCenter} zoom={HIGH_ZOOM_LEVEL} />}
                {/* --- END: FocusView modification --- */}

            </MapContainer>
        </div>
    );
}

export default AgencyDashboard;
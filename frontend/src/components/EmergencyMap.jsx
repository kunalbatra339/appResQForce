// src/components/EmergencyMap.jsx (Restored multiple routes, corrected icons)
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import apiClient from '../api/axiosConfig';
import useAuth from '../hooks/useAuth';
import '../styling/EmergencyMap.css';

import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import 'leaflet-routing-machine';

// --- CORRECTED: Icon definitions ---

// Agency Icon (Blue, standard size)
const agencyIcon = L.divIcon({
    className: 'custom-agency-icon',
    html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="25" height="25" fill="#3498db">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
});

// Emergency Icon (Red, standard size)
const emergencyIcon = L.divIcon({
    className: 'custom-emergency-icon',
    html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="25" height="25" fill="#e74c3c">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -28]
});
// --- END: Icon definitions ---


// --- Haversine distance calculation (unchanged) ---
const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 0.5 - Math.cos(dLat)/2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * (1 - Math.cos(dLon))/2;
    return R * 2 * Math.asin(Math.sqrt(a));
};

// --- FitBounds component (Logic updated to fit ALL points) ---
const FitBounds = ({ points, enabled }) => {
    const map = useMap();
    useEffect(() => {
        // Fit ALL points when enabled
        if (enabled && points && points.length > 0) { // Check length > 0
            console.log("Auto-fitting bounds...");
            const bounds = L.latLngBounds(points); // Use all points
            map.fitBounds(bounds, { padding: [70, 70] });
        }
        // No separate logic needed for single point, fitBounds handles it.
    }, [points, map, enabled]);
    return null;
};
// --- END: FitBounds update ---


// --- RoutingMachine component (Hides markers - Unchanged) ---
const RoutingMachine = ({ start, end }) => {
    const map = useMap();
    useEffect(() => {
        if (!map || !start || !end) return;

        const transparentIcon = L.icon({
             iconUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
             iconSize: [1, 1], iconAnchor: [0, 0],
        });

        const routingControl = L.Routing.control({
            waypoints: [ L.latLng(start[0], start[1]), L.latLng(end[0], end[1]) ],
            fitSelectedRoutes: false,
            routeWhileDragging: false,
            createMarker: function(i, waypoint, n) {
                 return L.marker(waypoint.latLng, { icon: transparentIcon, interactive: false });
             },
            lineOptions: { styles: [{ color: 'blue', opacity: 0.7, weight: 5 }] },
            show: false, addWaypoints: false,
        }).addTo(map);

        return () => {
             if (map && routingControl && map.hasLayer(routingControl)) {
                 map.removeControl(routingControl);
             }
        }
    }, [map, start, end]);
    return null;
};
// --- END: RoutingMachine component ---


function EmergencyMap() {
    // --- State variables (Removed closestPairPoints, closestRoute) ---
    const [emergencies, setEmergencies] = useState([]);
    const [agencies, setAgencies] = useState([]);
    const [message, setMessage] = useState({ text: '', type: '' });
    // --- UPDATED: State holds multiple routes ---
    const [emergencyRoutes, setEmergencyRoutes] = useState([]);
    // --- UPDATED: State holds points for ALL visible items for bounds ---
    const [pointsForBounds, setPointsForBounds] = useState(null);
    const [isAutoFitEnabled, setIsAutoFitEnabled] = useState(true);
    // --- END: State variable updates ---
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const markerRefs = useRef({});

    // --- displayMessage and useEffect for status message (unchanged) ---
    const displayMessage = (text, type) => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };
    useEffect(() => {
        if (searchParams.get('status') === 'deleted') {
            displayMessage('✅ All emergencies deleted successfully!', 'success');
            searchParams.delete('status');
            setSearchParams(searchParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    // --- useEffect for fetching data (Corrected merge logic - Unchanged from previous fix) ---
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [emergenciesRes, agenciesRes] = await Promise.all([
                    apiClient.get('/emergency_details'),
                    apiClient.get('/agencies')
                ]);
                setEmergencies(prevEmergencies => {
                    const prevPositions = prevEmergencies.reduce((acc, em) => {
                        acc[em._id] = { latitude: em.latitude, longitude: em.longitude };
                        return acc;
                    }, {});
                    const mergedEmergencies = emergenciesRes.data.map(fetchedEm => {
                        const prevPos = prevPositions[fetchedEm._id];
                        if (prevPos && (prevPos.latitude !== fetchedEm.latitude || prevPos.longitude !== fetchedEm.longitude)) {
                            const prevEm = prevEmergencies.find(e => e._id === fetchedEm._id);
                            return prevEm ? prevEm : fetchedEm;
                        }
                        return fetchedEm;
                    });
                    return mergedEmergencies;
                });
                setAgencies(agenciesRes.data);
                emergenciesRes.data.forEach(em => { // Use fetched data for refs init
                     if (!markerRefs.current[em._id]) {
                         markerRefs.current[em._id] = null;
                     }
                 });
            } catch (error) {
                if (error.response?.status === 401) {
                    logout();
                    navigate('/login');
                } else {
                     console.error("Error fetching data:", error);
                }
            }
        };
        fetchData();
        const intervalId = setInterval(fetchData, 5000);
        return () => clearInterval(intervalId);
    }, [navigate, logout]); // Removed emergencies dependency again

    // --- UPDATED: useEffect to calculate routes for EACH emergency and bounds ---
    useEffect(() => {
        if (emergencies.length > 0 && agencies.length > 0) {
            // Filter nearby agencies (same logic)
            const nearbyAgencies = agencies.filter(agency => {
                if (agency._id === user?.id) return false;
                if (agency.role === 'ndrf') return false;
                const isNearEmergency = emergencies.some(emergency => getDistanceInKm(agency.latitude, agency.longitude, emergency.latitude, emergency.longitude) <= 75);
                return isNearEmergency;
            });
            // Combine with logged-in user (same logic)
            const allRelevantAgencies = [...nearbyAgencies];
            if (user && user.latitude && user.longitude) {
                allRelevantAgencies.push({
                    _id: user.id, latitude: user.latitude, longitude: user.longitude, name: user.name, expertise: 'Your Location'
                });
            }

            // Calculate routes for EACH emergency
            const routes = emergencies.map(emergency => {
                let closestAgency = null;
                let minDistance = Infinity;
                if (allRelevantAgencies.length > 0) {
                    allRelevantAgencies.forEach(agency => {
                        const distance = getDistanceInKm(agency.latitude, agency.longitude, emergency.latitude, emergency.longitude);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestAgency = agency;
                        }
                    });
                }
                if (closestAgency) {
                    return {
                        emergencyId: emergency._id,
                        start: [closestAgency.latitude, closestAgency.longitude],
                        end: [emergency.latitude, emergency.longitude], // Use current state position
                        key: `${closestAgency._id}-${emergency._id}`
                    };
                }
                return null;
            }).filter(route => route !== null);
            setEmergencyRoutes(routes); // Set the array of routes

            // Calculate points for bounds fitting (ALL visible items)
            const boundsPoints = emergencies.map(e => [e.latitude, e.longitude]);
            if (user && user.latitude && user.longitude) {
                boundsPoints.push([user.latitude, user.longitude]);
            }
            nearbyAgencies.forEach(agency => { // Use nearbyAgencies list
                boundsPoints.push([agency.latitude, agency.longitude]);
            });
            setPointsForBounds(boundsPoints); // Set points for FitBounds

        } else {
            // Clear routes and bounds if no emergencies or agencies
            setEmergencyRoutes([]);
            if (user && user.latitude && user.longitude) {
                setPointsForBounds([[user.latitude, user.longitude]]);
            } else {
                 setPointsForBounds(null);
            }
        }
    }, [emergencies, agencies, user]);
    // --- END: Route and bounds calculation update ---


    // --- Filter agencies for rendering markers (unchanged) ---
     const visibleAgenciesForMarkers = agencies.filter(agency => {
        if (agency._id === user?.id) return false;
        if (agency.role === 'ndrf') return false;
        const isNearEmergency = emergencies.some(emergency => getDistanceInKm(agency.latitude, agency.longitude, emergency.latitude, emergency.longitude) <= 75);
        return isNearEmergency;
     });

    // --- Function to toggle auto-fit state (unchanged) ---
    const toggleAutoFit = () => {
        setIsAutoFitEnabled(prevState => !prevState);
        console.log("AutoFit Toggled:", !isAutoFitEnabled);
    };

    // --- Handler for marker drag end (unchanged) ---
    const handleEmergencyDragEnd = (emergencyId, event) => {
        const { lat, lng } = event.target.getLatLng();
        console.log(`Dragged emergency ${emergencyId} to:`, lat, lng);
        setEmergencies(currentEmergencies =>
            currentEmergencies.map(em =>
                em._id === emergencyId ? { ...em, latitude: lat, longitude: lng } : em
            )
        );
    };

    return (
        <>
            <div className="controls-container">
                <Link to="/dashboard" className="back-button">
                    ← Back to Dashboard
                </Link>
                <button onClick={toggleAutoFit} className="toggle-autofit-button" title={isAutoFitEnabled ? "Disable Auto-Focus" : "Enable Auto-Focus"}>
                    {isAutoFitEnabled ? '🔄' : '🚫'}
                </button>
            </div>
            {message.text && (
                <div className={`message-bar ${message.type}`}>{message.text}</div>
            )}
            <div id="map-container">
                <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />

                    {/* --- Render Agency Markers (Uses BLUE agencyIcon) --- */}
                    {user && user.role !== 'ndrf' && user.latitude && user.longitude && (
                        <Marker position={[user.latitude, user.longitude]} icon={agencyIcon}>
                            <Popup><b>Your Location</b><br />{user.name}</Popup>
                        </Marker>
                    )}
                    {visibleAgenciesForMarkers.map(agency => (
                        <Marker key={agency._id} position={[agency.latitude, agency.longitude]} icon={agencyIcon}>
                            <Popup><b>{agency.name}</b><br />{agency.expertise} Team</Popup>
                        </Marker>
                    ))}

                    {/* --- Render Draggable Emergency Markers (Uses RED emergencyIcon) --- */}
                    {emergencies.map((emergency, index) => (
                        <Marker
                            key={emergency._id}
                            position={[emergency.latitude, emergency.longitude]}
                            icon={emergencyIcon} // Correct red icon
                            draggable={true}
                            eventHandlers={{ dragend: (event) => handleEmergencyDragEnd(emergency._id, event) }}
                            ref={el => markerRefs.current[emergency._id] = el}
                        >
                            <Popup><b>{emergency.severity_display}</b><br />{emergency.description}<br />Distance: {emergency.distance ? `${emergency.distance.toFixed(2)} m` : 'N.A'}</Popup>
                        </Marker>
                    ))}

                    {/* --- UPDATED: Render multiple routes --- */}
                    {emergencyRoutes.map(route => (
                        <RoutingMachine key={route.key} start={route.start} end={route.end} />
                    ))}
                    {/* --- END: Render routes update --- */}


                    {/* --- UPDATED: Pass points for fitting ALL visible markers --- */}
                    <FitBounds points={pointsForBounds} enabled={isAutoFitEnabled} />

                </MapContainer>
            </div>
        </>
    );
}

export default EmergencyMap;
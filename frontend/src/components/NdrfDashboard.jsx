// src/components/NdrfDashboard.jsx (Updated with red emergency icons)
import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet'; // <-- Import L for L.divIcon
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosConfig';
import useAuth from '../hooks/useAuth';

// --- ADDED: Definition for the red emergency icon ---
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
// --- END: Icon definition ---

const styles = {
    body: { fontFamily: 'Arial, sans-serif', margin: 0, padding: 0, background: '#1a202c', color: '#e2e8f0', minHeight: '100vh' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px' },
    title: { textAlign: 'center', margin: 0, color: '#f56565', fontSize: '2.5rem', fontWeight: 'bold' },
    map: { height: '500px', width: '90%', margin: '20px auto', borderRadius: '0.75rem', boxShadow: '0 0 15px rgba(0,0,0,0.4)' },
    table: { width: '90%', margin: '20px auto', borderCollapse: 'collapse', background: '#2d3748', boxShadow: '0 0 10px rgba(0,0,0,0.2)', borderRadius: '0.75rem', overflow: 'hidden' },
    th: { padding: '12px', border: '1px solid #4a5568', textAlign: 'left', background: '#4299e1', color: 'white', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.9rem' },
    td: { padding: '12px', border: '1px solid #4a5568', textAlign: 'left' },
    trEven: { backgroundColor: '#2a3340' },
    deleteButton: { background: 'none', border: 'none', color: '#f87171', fontSize: '1.2rem', cursor: 'pointer', transition: 'transform 0.2s' },
};

function NdrfDashboard() {
    const [emergencies, setEmergencies] = useState([]);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { logout } = useAuth();
    
    // --- fetchNdrfData (unchanged) ---
    const fetchNdrfData = useCallback(async () => {
        try {
            const response = await apiClient.get('/emergency_details');
            setEmergencies(response.data);
            setError('');
        } catch (err) {
            console.error("Failed to fetch NDRF data:", err);
            setError("Failed to load data. Please try again.");
             if (err.response?.status === 401) {
                logout();
                navigate('/login');
            }
        }
    }, [logout, navigate]);

    // --- useEffect for fetching (unchanged) ---
    useEffect(() => {
        fetchNdrfData();
        const intervalId = setInterval(fetchNdrfData, 10000); // Refresh every 10 seconds
        return () => clearInterval(intervalId);
    }, [fetchNdrfData]);

    // --- handleDeleteEmergency (unchanged) ---
    const handleDeleteEmergency = async (emergencyId) => {
        const isConfirmed = window.confirm("Do you want to delete this emergency?");
        if (isConfirmed) {
            try {
                await apiClient.delete(`/emergency/${emergencyId}`);
                fetchNdrfData();
            } catch (err) {
                console.error("Failed to delete emergency:", err);
                alert("Could not delete the emergency. Please try again.");
            }
        }
    };

    // --- handleLogout (unchanged) ---
    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div style={styles.body}>
            <div style={styles.header}>
                <Link to="/emergency_map" style={{ color: '#63b3ed' }}>View Emergency Map</Link>
                <h1 style={styles.title}>🛡️ NDRF Command Dashboard</h1>
                <button onClick={handleLogout} style={{ background: 'none', border: '1px solid #e53e3e', color: '#e53e3e', padding: '8px 12px', borderRadius: '5px', cursor: 'pointer' }}>Logout</button>
            </div>

            <div style={styles.map}>
                <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%', width: '100%', borderRadius: 'inherit' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                    {/* --- UPDATED: Apply red icon to emergency markers --- */}
                    {emergencies.map(e => (
                        // Check for valid coordinates before rendering
                        (e.latitude != null && e.longitude != null) &&
                        <Marker
                            key={e._id}
                            position={[e.latitude, e.longitude]}
                            icon={emergencyIcon} // <-- Apply the red icon here
                        >
                            <Popup>{e.description}</Popup>
                        </Marker>
                    ))}
                    {/* --- END: Marker update --- */}
                </MapContainer>
            </div>

            <table style={styles.table}>
                <thead>
                    <tr>
                        <th style={styles.th}>ID</th>
                        <th style={styles.th}>Severity</th>
                        <th style={styles.th}>Description</th>
                        <th style={styles.th}>Tag</th>
                        <th style={styles.th}>Reported At</th>
                        <th style={styles.th}>Distance (m)</th>
                        <th style={styles.th}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {error && <tr><td colSpan="7" style={{...styles.td, textAlign: 'center', color: '#f56565'}}>{error}</td></tr>}
                    {!error && emergencies.length === 0 && (
                        <tr><td colSpan="7" style={{...styles.td, textAlign: 'center'}}>No pending emergencies found.</td></tr>
                    )}
                    {!error && emergencies.map((e, index) => (
                        <tr key={e._id} style={index % 2 === 1 ? styles.trEven : {}}>
                            <td style={styles.td}>{e._id.substring(0, 8)}...</td>
                            <td style={{...styles.td, color: e.severity === 'high' ? '#ef4444' : e.severity === 'medium' ? '#f59e0b' : '#10b981'}}>{e.severity_display}</td>
                            <td style={styles.td}>{e.description}</td>
                            <td style={styles.td}>{e.tag}</td>
                            <td style={styles.td}>{new Date(e.created_at).toLocaleString()}</td>
                            <td style={styles.td}>{e.distance ? e.distance.toFixed(2) + ' m' : 'N/A'}</td>
                            <td style={{...styles.td, textAlign: 'center'}}>
                                <button
                                    onClick={() => handleDeleteEmergency(e._id)}
                                    style={styles.deleteButton}
                                    title="Delete Emergency"
                                >
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default NdrfDashboard;
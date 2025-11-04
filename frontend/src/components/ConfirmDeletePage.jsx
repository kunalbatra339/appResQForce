// src/components/ConfirmDeletePage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosConfig';

const styles = {
    body: { backgroundColor: '#1a202c', color: '#e2e8f0', fontFamily: "'Inter', sans-serif", display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' },
    container: { backgroundColor: '#2d3748', padding: '2.5rem', borderRadius: '0.75rem', boxShadow: '0 10px 15px rgba(0, 0, 0, 0.3)', width: '100%', maxWidth: '400px', textAlign: 'center' },
    title: { fontSize: '1.5rem', fontWeight: 'bold', color: '#f87171', marginBottom: '1.5rem' },
    text: { color: '#cbd5e0', marginBottom: '1.5rem' },
    input: { width: '100%', padding: '0.75rem', marginBottom: '1rem', borderRadius: '0.5rem', border: '1px solid #4a5568', backgroundColor: '#4a5568', color: '#e2e8f0', outline: 'none' },
    button: { padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', cursor: 'pointer', transition: 'background-color 0.2s ease-in-out', width: '100%', border: 'none' },
    dangerBtn: { backgroundColor: '#e53e3e', color: 'white', marginBottom: '0.75rem' },
    secondaryBtn: { backgroundColor: '#4a5568', color: 'white' },
    errorMessage: { marginTop: '1rem', padding: '0.75rem', borderRadius: '0.5rem', backgroundColor: '#f56565', color: 'white', fontWeight: '500' }
};

function ConfirmDeletePage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (event) => {
        event.preventDefault();
        setError('');

        try {
            // NOTE: The updated Flask endpoint expects JSON, not FormData.
            const response = await apiClient.post('/delete_emergencies', {
                email,
                password
            });
            
            if (response.status === 200) {
                // On success, redirect to the map with a success parameter
                navigate('/emergency_map?status=deleted');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'An unexpected error occurred.');
        }
    };

    return (
        <div style={styles.body}>
            <div style={styles.container}>
                <h2 style={styles.title}>NDRF Deletion Confirmation</h2>
                <p style={styles.text}>Enter NDRF credentials to confirm deletion of ALL emergencies. This action is irreversible.</p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        placeholder="NDRF Email"
                        style={styles.input}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                    <input
                        type="password"
                        placeholder="NDRF Password"
                        style={styles.input}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button type="submit" style={{...styles.button, ...styles.dangerBtn}}>
                        Confirm & Delete All
                    </button>
                    <button type="button" onClick={() => navigate(-1)} style={{...styles.button, ...styles.secondaryBtn}}>
                        Cancel
                    </button>
                </form>
                {error && <div style={styles.errorMessage}>{error}</div>}
            </div>
        </div>
    );
}

export default ConfirmDeletePage;
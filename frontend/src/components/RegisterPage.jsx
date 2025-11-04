// src/components/RegisterPage.jsx (Updated with Rescuing ID field)
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../api/axiosConfig';
import useAuth from '../hooks/useAuth';
import '../styling/RegisterPage.css'; // Import the new stylesheet

function RegisterPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    expertise: '',
    rescuingId: '' // <-- NEW: State for Rescuing ID
  });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.expertise) {
        setError("Please select an expertise.");
        return;
    }
    setError('');

    try {
      const response = await apiClient.post('/register', formData); // formData now includes rescuingId
      if (response.data.status === 'success') {
        login(response.data.user);
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="auth-container">
      <div className="register-container">
        <h2>Join ResQForce</h2>
        <p className="tagline">Empowering Every Responder</p>
        <form onSubmit={handleSubmit}>
          <input type="text" name="name" placeholder="Agency Name" onChange={handleChange} required />
          <input type="email" name="email" placeholder="Email" onChange={handleChange} required />
          <input type="password" name="password" placeholder="Password" onChange={handleChange} required />
          {/* --- NEW: Rescuing ID input field --- */}
          <input 
            type="text" 
            name="rescuingId" 
            placeholder="Rescuing ID" 
            onChange={handleChange} 
            required 
          />
          {/* --- END: Rescuing ID input field --- */}
          <select name="expertise" onChange={handleChange} required value={formData.expertise}>
            <option value="">Select Expertise</option>
            <option value="Medical">Medical</option>
            <option value="Search & Rescue">Search & Rescue</option>
            <option value="Firefighting">Firefighting</option>
            <option value="Logistics">Logistics</option>
            <option value="Other">Other</option>
          </select>
          {error && <p className="error">{error}</p>}
          <button type="submit">Register</button>
        </form>
        <div className="login-link">
          Already have an account? <Link to="/login">Login here</Link>
        </div>
      </div>
    </div>
  );
}

export default RegisterPage;
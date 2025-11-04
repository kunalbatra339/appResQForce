// src/components/IndexPage.jsx
import React from 'react';
import { Link } from 'react-router-dom';
import '../styling/IndexPage.css'; // Import the new stylesheet

function IndexPage() {
  return (
    <div className="auth-container">
      <div className="container">
        <h1>ResQForce</h1>
        <p className="tagline">OneTouch Emergency Response System</p>
        <div className="button-group">
          <Link to="/login" className="btn">
            Rescue Team Login
          </Link>
          <Link to="/client" className="btn danger">
            Report Emergency
          </Link>
        </div>
        <p className="disclaimer">
          Disclaimer: This platform is designed for demonstration and educational purposes only.
          For real emergencies, please contact your local authorities directly.
        </p>
      </div>
    </div>
  );
}

export default IndexPage;
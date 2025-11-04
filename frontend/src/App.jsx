// src/App.jsx (Integrated Correct Offline Queue Logic)
import React, { useEffect } from 'react'; // <-- MODIFIED: Ensured useEffect is imported
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'; // No change
import { AuthProvider } from './context/AuthContext'; // No change
import useAuth from './hooks/useAuth'; // No change
import apiClient from './api/axiosConfig'; // <-- ADDED: Ensure apiClient is imported

// Import your page components (Unchanged)
import IndexPage from './components/IndexPage';
import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import ClientPage from './components/ClientPage';
import AgencyDashboard from './components/AgencyDashboard';
import NdrfDashboard from './components/NdrfDashboard';
import EmergencyMap from './components/EmergencyMap';
import ConfirmDeletePage from './components/ConfirmDeletePage';

// A component to protect routes that require authentication (Unchanged)
const ProtectedRoute = ({ allowedRoles }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <div>Loading...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        return <Navigate to="/dashboard" replace />;
    }

    return <Outlet />;
};

// A component for routes that should only be accessible when logged out (Unchanged)
const PublicOnlyRoute = () => {
    const { user, loading } = useAuth();
    if (loading) {
        return <div>Loading...</div>;
    }
    return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
};


function App() {

  // --- REPLACED: useEffect hook with the corrected offline queue logic ---
  useEffect(() => {
    // Define the async function separately
    const processQueue = async () => {
      console.log("[Queue] Checking network status for queue processing...");
      if (!navigator.onLine) {
          console.log("[Queue] Still offline, skipping.");
          return;
      }

      let queuedReports = [];
      try {
           queuedReports = JSON.parse(localStorage.getItem('queuedEmergencyReports') || '[]');
      } catch (e) { console.error("[Queue] Error reading queue:", e); localStorage.removeItem('queuedEmergencyReports'); return; }

      if (queuedReports.length === 0) {
          console.log("[Queue] No reports to process."); return;
      }

      console.log(`[Queue] Network online. Processing ${queuedReports.length} reports...`);
      let updatedReports = [...queuedReports];
      let currentLocation = null;

      if (navigator.geolocation) {
          try {
              console.log("[Queue] Attempting to get fresh location...");
              // Wrap geolocation in a promise for await
              const position = await new Promise((resolve, reject) => {
                  navigator.geolocation.getCurrentPosition(resolve, reject, {
                      enableHighAccuracy: true,
                      timeout: 10000,
                      maximumAge: 0
                  });
              });
              currentLocation = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude
              };
              console.log("[Queue] Got fresh location:", currentLocation);

              updatedReports = queuedReports.map(report => {
                  let updatedDescription = report.description;
                  if (report.description.includes("(Location Accuracy Low - Reported Offline)")) {
                       updatedDescription = report.description.replace("(Location Accuracy Low - Reported Offline)", "(Location Updated on Reconnect)");
                  } else if (!report.description.includes("(Location Updated on Reconnect)")) {
                       updatedDescription += " (Location Updated on Reconnect)";
                  }
                  return { ...report, lat: currentLocation.lat, lng: currentLocation.lng, description: updatedDescription };
              });
              console.log("[Queue] Updated queued reports with fresh location.");
          } catch (geoError) {
              console.warn("[Queue] Could not get fresh location while online:", geoError.message);
              console.log("[Queue] Proceeding with original queued locations.");
              updatedReports = [...queuedReports]; // Fallback to original
          }
      } else {
          console.warn("[Queue] Geolocation not supported, sending with original queued locations.");
          updatedReports = [...queuedReports]; // Fallback to original
      }

      let remainingReports = [...updatedReports];
      // Use Promise.allSettled to handle individual send failures without stopping others
      const sendPromises = updatedReports.map(async (report) => {
          try {
              console.log("[Queue] Attempting send:", report);
              await apiClient.post('/report_emergency', report);
              console.log("[Queue] Success:", report.timestamp);
              return { timestamp: report.timestamp, status: 'fulfilled' }; // Indicate success
          } catch (err) {
              console.error("[Queue] Failed send:", report, err);
              return { timestamp: report.timestamp, status: 'rejected', error: err }; // Indicate failure
          }
      });

      // Wait for all promises to settle (either succeed or fail)
      const results = await Promise.allSettled(sendPromises);

      // Keep only reports that failed (status is 'rejected')
      const failedTimestamps = results
          .filter(r => r.status === 'rejected')
          // Safely access timestamp from the reason object if it exists
          .map(r => r.reason?.timestamp);

      // Update remainingReports based on failure status
      // Ensure failedTimestamps is an array before using includes
      const validFailedTimestamps = Array.isArray(failedTimestamps) ? failedTimestamps : [];
      remainingReports = updatedReports.filter(r => validFailedTimestamps.includes(r.timestamp));


      try {
           localStorage.setItem('queuedEmergencyReports', JSON.stringify(remainingReports));
           const successfulCount = updatedReports.length - remainingReports.length;
           if (successfulCount > 0) console.log(`[Queue] ${successfulCount} reports sent successfully.`);
           if (remainingReports.length > 0) console.warn(`[Queue] ${remainingReports.length} reports remain queued due to errors.`);
      } catch(e) { console.error("[Queue] Error writing updated queue:", e); }
    };

    // Define the online event handler
    const handleOnlineStatus = () => {
        console.log("Browser came online! Triggering queue process...");
        // Added safety try...catch around the async call from the event listener
        try {
             processQueue();
        } catch (error) {
             console.error("Error processing queue from online event:", error);
        }
    };

    // --- Setup ---
    console.log("Setting up 'online' event listener...");
    window.addEventListener('online', handleOnlineStatus);

    // Initial check (with safety try...catch)
    console.log("Performing initial queue check on load...");
    try {
        processQueue();
    } catch (error) {
         console.error("Error during initial queue processing:", error);
    }


    // --- Cleanup ---
    return () => {
      console.log("Cleaning up 'online' event listener...");
      window.removeEventListener('online', handleOnlineStatus);
    };
  }, []); // Empty dependency array ensures this runs only once
  // --- END: useEffect replacement ---


  // --- Return statement JSX (Unchanged) ---
  return (
    <AuthProvider>
      {/* BrowserRouter was already correctly used */}
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<IndexPage />} />
          <Route path="/client" element={<ClientPage />} />

          {/* Public-Only Routes (Login, Register) */}
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected Routes (Require Login) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="/emergency_map" element={<EmergencyMap />} />

            <Route element={<ProtectedRoute allowedRoles={['ndrf']} />}>
                <Route path="/ndrf-dashboard" element={<NdrfDashboard />} />
                <Route path="/confirm_ndrf_delete" element={<ConfirmDeletePage />} />
            </Route>
          </Route>

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
  // --- End Return statement ---
}

// --- DashboardRedirect component (Unchanged but includes safety check) ---
const DashboardRedirect = () => {
    const { user } = useAuth();
    if (!user) { return <div>Loading user dashboard...</div>; } // Keep safety check
    if (user.role === 'ndrf') { return <NdrfDashboard />; }
    return <AgencyDashboard />;
};
// --- End DashboardRedirect ---

export default App; // Unchanged
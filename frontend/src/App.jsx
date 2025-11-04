// src/App.jsx (FIXED: Race condition resolved)
import React, { useEffect, useState } from 'react'; // MODIFIED: Added useState
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'; // No change
import { AuthProvider } from './context/AuthContext'; // No change
import useAuth from './hooks/useAuth'; // No change
import apiClient from './api/axiosConfig'; // No change

// --- ADDED: Imports for new native features ---
import { App } from '@capacitor/app'; // For native back button and app events
import { Geolocation } from '@capacitor/geolocation'; // For requesting location permissions
import PullToRefresh from 'react-simple-pull-to-refresh'; // For pull-to-refresh
// --- END: Added Imports ---

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

  // --- ADDED: State flag to chain useEffects and prevent race condition ---
  const [isPermissionChecked, setIsPermissionChecked] = useState(false);
  // --- END: Added State ---

  // --- ADDED: Pull-to-Refresh Handler ---
  const handleRefresh = () => {
    console.log("[Refresh] Pull-to-refresh triggered. Reloading window...");
    window.location.reload();
  };
  // --- END: Pull-to-Refresh Handler ---

  // --- ADDED: Native Back Button Handler ---
  useEffect(() => {
    // We only add this listener if we're on a native platform
    if (App.isNativePlatform()) {
      console.log("[Back Button] Setting up native back button listener...");
      // Save the listener to a variable
      const backButtonListener = App.addListener('backButton', ({ canGoBack }) => {
        if (canGoBack) {
          console.log("[Back Button] Native back button: navigating history back.");
          window.history.back();
        } else {
          console.log("[Back Button] Native back button: no history, exiting app.");
          App.exitApp();
        }
      });

      // Use that variable in the cleanup function
      return () => {
        console.log("[Back Button] Cleaning up native back button listener...");
        backButtonListener.remove();
      };
    } else {
      console.log("[Back Button] Not a native platform, skipping back button listener.");
    }
  }, []); // Empty array means this runs once
  // --- END: Native Back Button Handler ---

  // --- MODIFIED: Request Location Permission on App Load ---
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        // Check current permission status
        const permStatus = await Geolocation.checkPermissions();
        console.log("[Geolocation] Permission status on load:", permStatus.location);
        if (permStatus.location !== 'granted') {
          // If not granted, request it
          console.log("[Geolocation] Requesting location permission...");
          await Geolocation.requestPermissions();
        }
      } catch (e) {
        console.error("[Geolocation] Error checking/requesting location permission:", e);
      } finally {
        // --- ADDED: This is the checkpoint flag ---
        console.log("[Geolocation] Permission check finished. Allowing queue to run.");
        setIsPermissionChecked(true); // Tell the app the check is done
      }
    };

    // Only run this logic if we're in the Capacitor native environment
    if (App.isNativePlatform()) {
      requestLocationPermission();
    } else {
      console.log("[Geolocation] Not a native platform, skipping permission request.");
      setIsPermissionChecked(true); // On web, set to true immediately
    }
  }, []); // Empty array means this runs once
  // --- END: MODIFIED Request Location Permission ---


  // --- MODIFIED: Offline queue logic now WAITS for permission check ---
  useEffect(() => {
    
    // --- ADDED: Guard clause to wait for permission check ---
    if (!isPermissionChecked) {
      console.log("[Queue] Waiting for permission check...");
      return; // Do not run this hook until permission check is complete
    }
    // --- END: Guard Clause ---

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
          console.log("[Queue] Attempting to get fresh location (post-permission)...");
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
    console.log("Performing initial queue check on load (post-permission)...");
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
  }, [isPermissionChecked]); // MODIFIED: This hook now DEPENDS on the permission check
  // --- END: MODIFIED useEffect ---


// --- Return statement JSX (MODIFIED) ---
  return (
    // --- ADDED: PullToRefresh Wrapper ---
    <PullToRefresh onRefresh={handleRefresh}>
      <AuthProvider>
        {/* BrowserRouter was already correctly used */}
        <BrowserRouter>
          <Routes>
            {/* Public Routes (Unchanged) */}
            <Route path="/" element={<IndexPage />} />
            <Route path="/client" element={<ClientPage />} />

            {/* Public-Only Routes (Login, Register) (Unchanged) */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
            </Route>

            {/* Protected Routes (Require Login) (Unchanged) */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardRedirect />} />
              <Route path="/emergency_map" element={<EmergencyMap />} />

              <Route element={<ProtectedRoute allowedRoles={['ndrf']} />}>
                <Route path="/ndrf-dashboard" element={<NdrfDashboard />} />
                <Route path="/confirm_ndrf_delete" element={<ConfirmDeletePage />} />
              </Route>
            </Route>

            {/* Fallback Route (Unchanged) */}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </PullToRefresh>
    // --- END: PullToRefresh Wrapper ---
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
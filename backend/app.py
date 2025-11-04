# app.py (Complete with all features + Email Notification Logic Added)

from flask import Flask, request, jsonify, session # Removed unused redirect, url_for
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
import hashlib
import os
from datetime import datetime, timezone
from math import radians, cos, sin, acos, asin, sqrt # Added asin, sqrt for Haversine
import re 
# --- NEW: Email Imports ---
# --- REMOVED: smtplib, ssl, EmailMessage imports ---
# --- NEW: SendGrid Imports ---
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
# --- END: SendGrid Imports ---
# --- END: Email Imports ---
# --- NEW: Import and load dotenv ---
from dotenv import load_dotenv
load_dotenv() # Loads variables from .env file
# --- END: dotenv ---

app = Flask(__name__)
app.secret_key = os.urandom(24)

# --- ADD THESE TWO LINES ---
app.config['SESSION_COOKIE_SECURE'] = True  # Ensures cookie is only sent over HTTPS
app.config['SESSION_COOKIE_SAMESITE'] = 'None' # Allows cookie to be sent from a different domain
# --- END OF ADDITION ---

CORS(app, 
    supports_credentials=True,
    origins=["*"],
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"]
)

# --- MongoDB Configuration (No changes here) ---
# Load the MONGO_URI from the environment variables
MONGO_URI = os.environ.get('MONGO_URI') 
client = MongoClient(MONGO_URI)
db = client['rescue_db']
agencies_collection = db['agencies']
emergencies_collection = db['emergencies']
resources_collection = db['resources'] # Keep if used elsewhere

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# --- NEW: Haversine Distance Calculation Function ---
def calculate_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance in kilometers between two points 
    on the earth (specified in decimal degrees)
    """
    # Check for None values
    if None in [lat1, lon1, lat2, lon2]:
        return float('inf') # Return infinity if any coordinate is missing

    try:
        # Convert decimal degrees to radians 
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

        # Haversine formula 
        dlon = lon2 - lon1 
        dlat = lat2 - lat1 
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a)) 
        r = 6371 # Radius of earth in kilometers. Use 3956 for miles
        return c * r
    except ValueError:
         return float('inf') # Handle potential math errors
# --- END: Haversine Function ---

# --- NEW: Email Sending Function ---
# --- REPLACED: Email Sending Function with SendGrid ---
def send_emergency_email(agency_email, emergency_details):
    """Sends an email notification using the SendGrid API."""
    
    sender_email = os.environ.get('EMAIL_ADDRESS') # Your resqforce1234@gmail.com
    sendgrid_api_key = os.environ.get('SENDGRID_API_KEY') # Reads the key from Render's env vars

    if not sender_email or not sendgrid_api_key:
        print("ERROR: EMAIL_ADDRESS or SENDGRID_API_KEY not configured.")
        return False

    # Construct email body (same as before)
    body = f"""
    A new emergency requires attention:

    Severity: {emergency_details.get('severity', 'N/A').capitalize()}
    Type: {emergency_details.get('tag', 'N/A').capitalize()}
    Description: {emergency_details.get('description', 'No description provided.')}
    Location: Approx. {emergency_details.get('location', 'N/A')}
    Reported At: {emergency_details.get('reported_at', datetime.now(timezone.utc)).strftime('%Y-%m-%d %H:%M:%S UTC')}

    Please respond accordingly.

    ---
    ResQForce Automated System
    (ID: {emergency_details.get('id', 'N/A')})
    """

    # Create the SendGrid Mail object
    message = Mail(
        from_email=sender_email,
        to_emails=agency_email,
        subject=f"New Emergency Assignment: {emergency_details.get('tag', 'N/A').capitalize()}",
        plain_text_content=body
    )
    
    try:
        print(f"Attempting to send assignment email to {agency_email} via SendGrid...")
        sg = SendGridAPIClient(sendgrid_api_key)
        response = sg.send(message)
        
        # Check SendGrid's response status code
        if response.status_code >= 200 and response.status_code < 300:
            print(f"Email sent successfully. Status Code: {response.status_code}")
            return True
        else:
            print(f"ERROR: SendGrid failed. Status: {response.status_code}, Body: {response.body}")
            return False
    except Exception as e:
        # This will catch errors if the API key is wrong or other issues
        print(f"ERROR: Failed to send email via SendGrid to {agency_email}: {e}")
        return False
# --- END: Email Sending Function Replacement ---

# --- API Endpoints ---

@app.route('/api/register', methods=['POST'])
def api_register():
    # --- Code Block Unchanged ---
    data = request.json
    try:
        rescuing_id = data.get('rescuingId')
        if not rescuing_id:
            return jsonify({'error': "Rescuing ID is required."}), 400
        pattern = r"^\d{4}[a-zA-Z]\d[a-zA-Z]{3}$"
        # Corrected error message slightly for clarity based on previous context
        if not re.fullmatch(pattern, rescuing_id):
             return jsonify({'error': "Invalid Rescuing ID pattern. Must be NNNNANAAA."}), 400
        if agencies_collection.find_one({'email': data['email']}):
            return jsonify({'error': "Email already registered"}), 409
        hashed_rescuing_id = hash_password(rescuing_id)
        if agencies_collection.find_one({'rescuing_id': hashed_rescuing_id}):
            return jsonify({'error': "Rescuing ID already in use."}), 409
        agency_data = {
            'name': data['name'], 'email': data['email'],
            'password': hash_password(data['password']), 'expertise': data['expertise'],
            'rescuing_id': hashed_rescuing_id, 'latitude': 20.5937, 'longitude': 78.9629,
            'last_updated': None, 'role': 'agency', 'verified': False, 'agency_type': 'local'
        }
        result = agencies_collection.insert_one(agency_data)
        session['agency_id'] = str(result.inserted_id)
        session['role'] = 'agency'
        session['latitude'] = agency_data['latitude']
        session['longitude'] = agency_data['longitude']
        return jsonify({'status': 'success','user': {'id': str(result.inserted_id),'name': data['name'],'role': 'agency'}}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    # --- End Unchanged Block ---

@app.route('/api/login', methods=['POST'])
def api_login():
    # --- Code Block Unchanged ---
    data = request.json
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    hashed_password = hash_password(password)
    try:
        agency = agencies_collection.find_one({'email': email})
        if agency and agency['password'] == hashed_password:
            session['agency_id'] = str(agency['_id'])
            session['role'] = agency.get('role', 'agency')
            session['latitude'] = agency.get('latitude', 20.5937)
            session['longitude'] = agency.get('longitude', 78.9629)
            return jsonify({'status': 'success', 'user': {'id': str(agency['_id']),'name': agency.get('name'),'role': agency.get('role', 'agency')}}), 200
        return jsonify({'error': 'Invalid credentials'}), 401
    except Exception as e:
        return jsonify({'error': f"Database error: {str(e)}"}), 500
    # --- End Unchanged Block ---

@app.route('/api/logout', methods=['POST'])
def api_logout():
    # --- Code Block Unchanged ---
    session.clear()
    return jsonify({'status': 'success'}), 200
    # --- End Unchanged Block ---

@app.route('/api/check_session')
def check_session():
    # --- Code Block Unchanged ---
    if 'agency_id' in session:
        agency = agencies_collection.find_one({'_id': ObjectId(session['agency_id'])})
        if agency:
            return jsonify({'isAuthenticated': True,'user': {'id': session['agency_id'],'name': agency.get('name'),'role': session.get('role'),'latitude': agency.get('latitude'),'longitude': agency.get('longitude')}})
    return jsonify({'isAuthenticated': False})
    # --- End Unchanged Block ---

@app.route('/api')
def api_index():
    # --- Code Block Unchanged ---
    return jsonify({'message': 'ResQForce API is running'})
    # --- End Unchanged Block ---

# --- MODIFIED: report_emergency endpoint ---
@app.route('/api/report_emergency', methods=['POST'])
def report_emergency():
    data = request.get_json()
    # Basic validation (unchanged)
    if not all(k in data for k in ['lat', 'lng', 'description', 'tag']):
        return jsonify({'error': 'Missing required emergency data'}), 400
    
    try:
        # Prepare emergency data (unchanged)
        emergency_lat = data['lat']
        emergency_lng = data['lng']
        report_time = datetime.now(timezone.utc) # Capture time before DB insert
        emergency_data = {
            'latitude': emergency_lat,
            'longitude': emergency_lng,
            'description': data['description'],
            'status': 'pending',
            'created_at': report_time,
            'reported_by': 'public',
            'tag': data['tag'],
            'severity': data.get('severity', 'low')
        }
        # Insert into DB (unchanged)
        result = emergencies_collection.insert_one(emergency_data)
        new_emergency_id = result.inserted_id # Get the ID

        # --- ADDED: Find Closest Agency Logic ---
        # Fetch only necessary fields, exclude NDRF role
        agencies = list(agencies_collection.find(
            {'role': {'$ne': 'ndrf'}}, # Exclude agencies with role 'ndrf'
            {'_id': 1, 'email': 1, 'latitude': 1, 'longitude': 1}
        ))
        
        closest_agency = None
        min_distance = float('inf')

        for agency in agencies:
            # Calculate distance using the Haversine function defined above
            distance = calculate_distance( 
                agency.get('latitude'), agency.get('longitude'),
                emergency_lat, emergency_lng
            )
            if distance < min_distance:
                min_distance = distance
                closest_agency = agency
        # --- END: Find Closest Agency Logic ---
        
        # --- ADDED: Send Email Logic ---
        if closest_agency and closest_agency.get('email'):
            email_details = {
                'id': str(new_emergency_id),
                'description': emergency_data['description'],
                'location': f"{emergency_lat:.5f}, {emergency_lng:.5f}", # Format coords
                'severity': emergency_data['severity'],
                'tag': emergency_data['tag'],
                'reported_at': report_time # Use captured time
            }
            # Call the email sending function (runs in the background)
            send_emergency_email(closest_agency['email'], email_details)
        else:
            print(f"No suitable non-NDRF agency found nearby for emergency {new_emergency_id} or agency missing email.")
            if not agencies:
                 print("Agency list was empty or only contained NDRF.")
        # --- END: Send Email Logic ---

        # Return success to the user immediately (email sends asynchronously)
        return jsonify({'message': 'Emergency reported successfully'}), 201
        
    except Exception as e:
        print(f"ERROR in /api/report_emergency: {e}") # Log the error
        return jsonify({'error': f'Failed to report emergency: {str(e)}'}), 500
# --- END MODIFICATION ---

@app.route('/api/update_location', methods=['POST'])
def update_location():
    # --- Code Block Unchanged ---
    if 'agency_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    data = request.json
    try:
        lat, lng = float(data['lat']), float(data['lng'])
        agencies_collection.update_one(
            {'_id': ObjectId(session['agency_id'])},
            {'$set': {'latitude': lat, 'longitude': lng, 'last_updated': datetime.now()}}
        )
        session['latitude'], session['longitude'] = lat, lng
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    # --- End Unchanged Block ---

@app.route('/api/emergencies')
def get_emergencies():
    # --- Code Block Unchanged ---
    try:
        emergencies = list(emergencies_collection.find({'status': 'pending'}).sort('created_at', -1))
        for emergency in emergencies:
            emergency['_id'] = str(emergency['_id'])
            severity = emergency.get('severity', 'low')
            emergency['severity_display'] = f"🔴 High" if severity == 'high' else f"🟡 Medium" if severity == 'medium' else f"🟢 Low"
        return jsonify(emergencies)
    except Exception as e:
        return jsonify({'error': 'Database error'}), 500
    # --- End Unchanged Block ---

@app.route('/api/emergency_details')
def get_all_emergency_details():
    # --- Code Block Unchanged (but uses calculate_distance now) ---
    if 'agency_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
    try:
        lat, lng = session.get('latitude', 20.5937), session.get('longitude', 78.9629)
        emergencies = list(emergencies_collection.find({'status': 'pending'}).sort('created_at', -1))
        for emergency in emergencies:
            emergency['_id'] = str(emergency['_id'])
            elat, elng = float(emergency.get('latitude', 0)), float(emergency.get('longitude', 0))
            # Check if coordinates are valid before calculating distance
            if lat is not None and lng is not None and elat is not None and elng is not None:
                 # Use calculate_distance function and convert km to meters
                 distance = calculate_distance(lat, lng, elat, elng) * 1000
                 emergency['distance'] = round(distance, 2)
            else:
                 emergency['distance'] = None # Handle cases with missing coords
            severity = emergency.get('severity', 'low')
            emergency['severity_display'] = f"🔴 High" if severity == 'high' else f"🟡 Medium" if severity == 'medium' else f"🟢 Low"
        return jsonify(emergencies)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    # --- End Unchanged Block ---

@app.route('/api/agencies')
def get_agencies():
    # --- Code Block Unchanged ---
     if 'agency_id' not in session:
         return jsonify({'error': 'Unauthorized'}), 401
     try:
         agencies = list(agencies_collection.find({}, {'name': 1, 'latitude': 1, 'longitude': 1, 'expertise': 1, 'role': 1}))
         for agency in agencies:
             agency['_id'] = str(agency['_id'])
         return jsonify(agencies)
     except Exception as e:
         return jsonify({'error': 'Database error'}), 500
    # --- End Unchanged Block ---

@app.route('/api/emergency/<emergency_id>', methods=['DELETE'])
def delete_single_emergency(emergency_id):
    # --- Code Block Unchanged ---
    if 'agency_id' not in session or session.get('role') != 'ndrf':
        return jsonify({'error': 'Unauthorized: NDRF access required.'}), 403
    try:
        result = emergencies_collection.delete_one({'_id': ObjectId(emergency_id)})
        if result.deleted_count == 1:
            return jsonify({'status': 'success', 'message': 'Emergency deleted successfully.'}), 200
        else:
            return jsonify({'error': 'Emergency not found.'}), 404
    except Exception as e:
        return jsonify({'error': f'An error occurred: {str(e)}'}), 500
    # --- End Unchanged Block ---

@app.route('/api/delete_emergencies', methods=['POST'])
def delete_all_emergencies():
    # --- Code Block Unchanged ---
    data = request.json
    email = data.get('email')
    password = data.get('password')
    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400
    try:
        ndrf_agency = agencies_collection.find_one({'email': email,'password': hash_password(password)})
        if not ndrf_agency or ndrf_agency.get('role') != 'ndrf':
            return jsonify({'error': 'Invalid credentials or insufficient permissions'}), 403
        result = emergencies_collection.delete_many({})
        return jsonify({'status': f'Successfully deleted {result.deleted_count} emergencies.'}), 200
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500
    # --- End Unchanged Block ---

if __name__ == '__main__':
    # --- Code Block Unchanged ---
    app.run(port=5000, debug=True)
    # --- End Unchanged Block ---

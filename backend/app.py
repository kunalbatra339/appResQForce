# app.py (Adding Twilio Call Feature)

from flask import Flask, request, jsonify, session
from flask_cors import CORS
from pymongo import MongoClient
from bson.objectid import ObjectId
import hashlib
import os
from datetime import datetime, timezone
from math import radians, cos, sin, acos, asin, sqrt
import re 
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
# --- NEW: Twilio Import ---
from twilio.rest import Client
# --- END: Twilio Import ---
from dotenv import load_dotenv
load_dotenv() 

app = Flask(__name__)
app.secret_key = os.urandom(24)

app.config['SESSION_COOKIE_SECURE'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'

CORS(app, 
    supports_credentials=True,
    # --- MODIFIED: Added localhost back for testing ---
    origins=["https://app-res-q-force.vercel.app", "http://localhost:5173"], 
    methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"]
)

# --- MongoDB Configuration (Unchanged) ---
MONGO_URI = os.environ.get('MONGO_URI') 
client = MongoClient(MONGO_URI)
db = client['rescue_db']
agencies_collection = db['agencies']
emergencies_collection = db['emergencies']
resources_collection = db['resources'] 

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# --- Haversine Distance Calculation Function (Unchanged) ---
def calculate_distance(lat1, lon1, lat2, lon2):
    if None in [lat1, lon1, lat2, lon2]: return float('inf') 
    try:
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
        dlon = lon2 - lon1 
        dlat = lat2 - lat1 
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a)) 
        r = 6371 
        return c * r
    except ValueError:
         return float('inf')

# --- Email Sending Function (Unchanged) ---
def send_emergency_email(agency_email, emergency_details):
    sender_email = os.environ.get('EMAIL_ADDRESS')
    sendgrid_api_key = os.environ.get('SENDGRID_API_KEY')
    if not sender_email or not sendgrid_api_key:
        print("ERROR: EMAIL_ADDRESS or SENDGRID_API_KEY not configured.")
        return False
    body = f"""
    A new emergency requires attention:
    Severity: {emergency_details.get('severity', 'N/A').capitalize()}
    Type: {emergency_details.get('tag', 'N/A').capitalize()}
    Description: {emergency_details.get('description', 'No description provided.')}
    Location: Approx. {emergency_details.get('location', 'N/A')}
    Reported At: {emergency_details.get('reported_at', datetime.now(timezone.utc)).strftime('%Y-%m-%d %H:%M:%S UTC')}
    ---
    ResQForce Automated System
    (ID: {emergency_details.get('id', 'N/A')})
    """
    message = Mail(
        from_email=sender_email, to_emails=agency_email,
        subject=f"New Emergency Assignment: {emergency_details.get('tag', 'N/A').capitalize()}",
        plain_text_content=body
    )
    try:
        print(f"Attempting to send assignment email to {agency_email} via SendGrid...")
        sg = SendGridAPIClient(sendgrid_api_key)
        response = sg.send(message)
        if response.status_code >= 200 and response.status_code < 300:
            print(f"Email sent successfully. Status Code: {response.status_code}")
            return True
        else:
            print(f"ERROR: SendGrid failed. Status: {response.status_code}, Body: {response.body}")
            return False
    except Exception as e:
        print(f"ERROR: Failed to send email via SendGrid to {agency_email}: {e}")
        return False

# --- NEW: Automated Voice Call Function ---
def send_emergency_call(agency_phone_number, emergency_details):
    """Sends an automated voice call to the specified agency via Twilio."""
    
    # Read credentials from environment variables
    account_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    auth_token = os.environ.get('TWILIO_AUTH_TOKEN')
    twilio_phone_number = os.environ.get('TWILIO_PHONE_NUMBER')

    if not all([account_sid, auth_token, twilio_phone_number]):
        print("ERROR: Twilio credentials (SID, TOKEN, or PHONE_NUMBER) not configured.")
        return False
        
    try:
        client = Client(account_sid, auth_token)

        # Create the dynamic text-to-speech message
        try:
            # Simple landmark guess (can be improved)
            landmark = f"near {emergency_details.get('description', 'the reported site').split('near')[-1].split(' ')[1]}"
        except:
            landmark = "at the reported coordinates"

        # TwiML (Twilio Markup Language) to tell Twilio what to say
        twiml_message = f"""
        <Response>
            <Say voice="alice" language="en-US">
                This is an automated dispatch from ResQForce.
            </Say>
            <Pause length="1"/>
            <Say voice="alice" language="en-US">
                New emergency reported.
                Severity: {emergency_details.get('severity', 'Not specified')}.
                Type: {emergency_details.get('tag', 'Not specified')}.
                Description: {emergency_details.get('description', 'No description provided.')}.
                Location: {landmark}.
            </Say>
            <Pause length="1"/>
            <Say voice="alice" language="en-US">
                Please check your email for full details. This is an automated message.
            </Say>
        </Response>
        """

        print(f"Attempting to place automated call to {agency_phone_number}...")
        
        call = client.calls.create(
            twiml=twiml_message,
            to=agency_phone_number,  # Must be in E.164 format (e.g., +91...)
            from_=twilio_phone_number
        )
        
        print(f"Call initiated successfully. Call SID: {call.sid}")
        return True
    
    except Exception as e:
        print(f"ERROR: Failed to place Twilio call to {agency_phone_number}: {e}")
        return False
# --- END: Automated Voice Call Function ---


# --- API Endpoints ---

@app.route('/api/register', methods=['POST'])
def api_register():
    # --- Code Block Unchanged ---
    data = request.json
    try:
        rescuing_id = data.get('rescuingId')
        if not rescuing_id: return jsonify({'error': "Rescuing ID is required."}), 400
        pattern = r"^\d{4}[a-zA-Z]\d[a-zA-Z]{3}$"
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
    if not email or not password: return jsonify({'error': 'Email and password are required'}), 400
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
        report_time = datetime.now(timezone.utc)
        emergency_data = {
            'latitude': emergency_lat, 'longitude': emergency_lng,
            'description': data['description'], 'status': 'pending',
            'created_at': report_time, 'reported_by': 'public',
            'tag': data['tag'], 'severity': data.get('severity', 'low')
        }
        # Insert into DB (unchanged)
        result = emergencies_collection.insert_one(emergency_data)
        new_emergency_id = result.inserted_id

        # --- MODIFIED: Find Closest Agency Logic (to include 'phone') ---
        agencies = list(agencies_collection.find(
            {'role': {'$ne': 'ndrf'}},
            # --- ADDED 'phone' to the fields to fetch ---
            {'_id': 1, 'email': 1, 'phone': 1, 'latitude': 1, 'longitude': 1}
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
        
        # --- MODIFIED: Send Email & Call Logic ---
        if closest_agency:
            # Prepare details
            email_details = {
                'id': str(new_emergency_id),
                'description': emergency_data['description'],
                'location': f"{emergency_lat:.5f}, {emergency_lng:.5f}",
                'severity': emergency_data['severity'],
                'tag': emergency_data['tag'],
                'reported_at': report_time
            }
            
            # 1. Send Email (Unchanged)
            if closest_agency.get('email'):
                send_emergency_email(closest_agency['email'], email_details)
            else:
                print(f"Agency {closest_agency.get('name')} missing email.")

            # 2. Send Call (NEW)
            if closest_agency.get('phone'):
                # Note: This runs in sequence.
                send_emergency_call(closest_agency['phone'], email_details)
            else:
                print(f"Agency {closest_agency.get('name')} missing phone number.")

        else:
            print(f"No suitable non-NDRF agency found nearby for emergency {new_emergency_id}.")
            if not agencies:
                 print("Agency list was empty or only contained NDRF.")
        # --- END: Send Email & Call Logic ---

        return jsonify({'message': 'Emergency reported successfully'}), 201
        
    except Exception as e:
        print(f"ERROR in /api/report_emergency: {e}")
        return jsonify({'error': f'Failed to report emergency: {str(e)}'}), 500
# --- END MODIFICATION ---

@app.route('/api/update_location', methods=['POST'])
def update_location():
    # --- Code Block Unchanged ---
    if 'agency_id' not in session: return jsonify({'error': 'Unauthorized'}), 401
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
    # --- Code Block Unchanged ---
    if 'agency_id' not in session: return jsonify({'error': 'Unauthorized'}), 401
    try:
        lat, lng = session.get('latitude', 20.5937), session.get('longitude', 78.9629)
        emergencies = list(emergencies_collection.find({'status': 'pending'}).sort('created_at', -1))
        for emergency in emergencies:
            emergency['_id'] = str(emergency['_id'])
            elat, elng = float(emergency.get('latitude', 0)), float(emergency.get('longitude', 0))
            if lat is not None and lng is not None and elat is not None and elng is not None:
                 distance = calculate_distance(lat, lng, elat, elng) * 1000
                 emergency['distance'] = round(distance, 2)
            else:
                 emergency['distance'] = None 
            severity = emergency.get('severity', 'low')
            emergency['severity_display'] = f"🔴 High" if severity == 'high' else f"🟡 Medium" if severity == 'medium' else f"🟢 Low"
        return jsonify(emergencies)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    # --- End Unchanged Block ---

@app.route('/api/agencies')
def get_agencies():
    # --- Code Block Unchanged ---
     if 'agency_id' not in session: return jsonify({'error': 'Unauthorized'}), 401
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
    if not email or not password: return jsonify({'error': 'Email and password are required'}), 400
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
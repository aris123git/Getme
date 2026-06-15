from flask import Flask, request, jsonify

app = Flask(__name__)
parser = SMSParser()

@app.route('/webhook/sms', methods=['POST'])
def receive_sms():
    """
    Endpoint que votre passerelle SMS appellera à chaque nouveau message
    """
    data = request.get_json()
    
    # Extraire les infos du SMS
    sms_text = data.get('text', '')
    sender = data.get('sender', '')
    
    # Analyser le message
    parsed = parser.parse(sms_text, sender)
    
    if parsed['success']:
        # 🔓 ICI : Débloquer l'utilisateur dans votre base de données
        # $db->update('users', ['unlocked' => true], ['phone' => parsed['sender']])
        
        print(f"✅ Paiement validé - {parsed['amount_fcfa']} de {parsed['sender']}")
        
        return jsonify({
            'status': 'success',
            'message': 'Paiement validé et compte débloqué',
            'data': parsed
        }), 200
    else:
        # Loguer l'erreur pour analyse manuelle
        print(f"⚠️ SMS non reconnu: {sms_text}")
        
        return jsonify({
            'status': 'error',
            'message': 'SMS non reconnu',
            'data': parsed
        }), 422

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'healthy'}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
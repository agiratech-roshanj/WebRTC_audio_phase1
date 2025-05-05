from flask import Flask, jsonify, request, render_template
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os
load_dotenv()

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('call.html')

@app.route('/session', methods=['GET'])
def get_session():
    try:
        url = "https://api.openai.com/v1/realtime/sessions"
#        https://sena.services
        payload = {
            "model": "gpt-4o-realtime-preview-2024-12-17",
            "modalities": ["audio", "text"],
            "instructions": "You are a friendly assistant."
        }
        
        headers = {
            'Authorization': 'Bearer ' + os.getenv('OPENAI_API_KEY'),
            'Content-Type': 'application/json'
        }

        response = requests.post(url, json=payload, headers=headers)
        return response.json()

    except Exception as e:
        return jsonify({'error': str(e)}), 500


def get_yesterdays_date():
    # Get actual yesterday's date (remove the hardcoded date for production)
    yesterday = datetime.now() - timedelta(days=1)
    return yesterday.strftime("%B %d, %Y")

@app.route('/search-sena', methods=['GET'])
def search_sena():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'Query is required'}), 400

    try:
        # First try: Search Sena.services
        sena_results, response_text = search_sena_services(query)
        
        if sena_results:
            return jsonify({
                "success": True,
                "source": "sena",
                "results": sena_results,
                "audio_response": response_text
            })
            
        # Fallback: Get yesterday's cricket results
        cricket_results, response_text = search_cricket_results()
        return jsonify({
            "success": True,
            "source": "cricket",
            "results": cricket_results,
            "audio_response": response_text
        })

    except requests.exceptions.RequestException as e:
        return jsonify({'error': f"Search API error: {e}"}), 500
    except Exception as e:
        return jsonify({'error': f"Unexpected error: {e}"}), 500

def search_sena_services(query):
    """Search Sena.services with formatted response"""
    params = {
        "q": f"{query} site:sena.services",
        "api_key": '5bfdb03df6dd2500452865011fb554f33a3fe3d5081802e7f5b57803e6ec08b7',
        "engine": "google",
        "num": 3
    }
    
    response = requests.get("https://serpapi.com/search", params=params)
    results = response.json().get('organic_results', [])
    
    simplified = [{
        "title": r.get("title"),
        "link": r.get("link"),
        "snippet": r.get("snippet")
    } for r in results if 'sena.services' in r.get('link', '')]

    audio_text = "I found this information: " + ". ".join([r['snippet'] for r in simplified[:2]]) if simplified else ""
    
    return simplified, audio_text

def search_cricket_results():
    """Search for yesterday's cricket matches"""
    date_str = get_yesterdays_date()
    params = {
        "q": f"{date_str} cricket match results",
        "api_key": '5bfdb03df6dd2500452865011fb554f33a3fe3d5081802e7f5b57803e6ec08b7',
        "engine": "google",
        "num": 3
    }
    
    response = requests.get("https://serpapi.com/search", params=params)
    results = response.json().get('organic_results', [])
    
    # Format results consistently
    simplified = [{
        "title": r.get("title"),
        "link": r.get("link"),
        "snippet": r.get("snippet")
    } for r in results]

    # Create natural language response
    if simplified:
        audio_text = f"Yesterday's cricket update: {simplified[0]['snippet']}"
    else:
        audio_text = "No recent cricket results found"
    
    return simplified, audio_text

if __name__ == '__main__':
    app.run(debug=True)
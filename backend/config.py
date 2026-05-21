import os
from dotenv import load_dotenv

load_dotenv()

# Google APIs
GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")

# OpenRouter / LLM
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"

# Weather
WEATHER_API_KEY: str = os.getenv("WEATHER_API_KEY", "")
OPENWEATHER_BASE_URL: str = "https://api.openweathermap.org/data/2.5"

# JWT / Auth
SECRET_KEY: str = os.getenv("SECRET_KEY", "mapmax-secret-change-me")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS: int = 7

# Database
DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./mapmax.db")

# Google Maps endpoints
GOOGLE_GEOCODE_URL: str = "https://maps.googleapis.com/maps/api/geocode/json"
GOOGLE_DIRECTIONS_URL: str = "https://maps.googleapis.com/maps/api/directions/json"
GOOGLE_PLACES_TEXTSEARCH_URL: str = "https://maps.googleapis.com/maps/api/place/textsearch/json"
GOOGLE_PLACES_NEARBYSEARCH_URL: str = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
GOOGLE_PLACE_DETAILS_URL: str = "https://maps.googleapis.com/maps/api/place/details/json"

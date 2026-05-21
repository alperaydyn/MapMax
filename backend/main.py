"""
MapMax API – entry point.
Run with: uvicorn main:app --reload
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.db import Base, engine
from routers import auth, agent, locations

# Create all database tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="MapMax API",
    description="AI-powered map assistant backend",
    version="1.0.0",
)

# Allow all origins in development; tighten in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(agent.router, tags=["agent"])
app.include_router(locations.router, prefix="/locations", tags=["locations"])


@app.get("/health", tags=["health"])
def health():
    """Simple liveness check."""
    return {"status": "ok"}

from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey,
    Text, Boolean
)
from sqlalchemy.orm import relationship
from database.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    location_history = relationship("LocationHistory", back_populates="user", cascade="all, delete-orphan")
    bookmarks = relationship("Bookmark", back_populates="user", cascade="all, delete-orphan")
    insights = relationship("LocationInsight", back_populates="user", cascade="all, delete-orphan")
    agent_messages = relationship("AgentMessage", back_populates="user", cascade="all, delete-orphan")


class LocationHistory(Base):
    __tablename__ = "location_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    place_id = Column(String, nullable=True)
    place_name = Column(String, nullable=True)
    # Stored as JSON string, e.g. '["restaurant", "food"]'
    place_types = Column(Text, nullable=True)
    address = Column(String, nullable=True)
    arrived_at = Column(DateTime, default=datetime.utcnow)
    departed_at = Column(DateTime, nullable=True)
    duration_minutes = Column(Float, nullable=True)

    user = relationship("User", back_populates="location_history")


class Bookmark(Base):
    __tablename__ = "bookmarks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    place_id = Column(String, nullable=True)
    address = Column(String, nullable=True)
    category = Column(String, default="favorite")
    created_at = Column(DateTime, default=datetime.utcnow)
    visit_count = Column(Integer, default=0)
    last_visited = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="bookmarks")


class LocationInsight(Base):
    __tablename__ = "location_insights"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Type: home / work / school / gym / frequent
    insight_type = Column(String, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    place_name = Column(String, nullable=True)
    address = Column(String, nullable=True)
    confidence = Column(Float, default=0.0)
    # JSON string with supporting evidence details
    evidence = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="insights")


class AgentMessage(Base):
    __tablename__ = "agent_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # role: "user" or "assistant"
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="agent_messages")

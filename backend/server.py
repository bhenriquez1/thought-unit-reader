# Minimal backend server for supervisor compatibility
# This Next.js app runs its own server; this provides a health check endpoint

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="Reading App Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Backend running - main app is Next.js on port 3000"}

@app.get("/")
def root():
    return {"message": "Reading App Backend API", "nextjs_url": "http://localhost:3000"}

import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from routers import admin, health, mono, prembly, screenings, screening_evidence
from services.screening_store import close_http_clients, initialize_http_clients

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("tentrust-api")

app = FastAPI(
    title="TenTrust Verification API",
    description="FastAPI backend for Mono-connected identity and credit checks",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(screening_evidence.router)
app.include_router(health.router)
app.include_router(mono.router)
app.include_router(prembly.router)
app.include_router(screenings.router)
app.include_router(admin.router)


@app.on_event("startup")
async def startup_event():
    initialize_http_clients()
    logger.info(f"Starting TenTrust API in {settings.ENVIRONMENT} mode...")
    logger.info("Mono identity and credit check modules loaded.")


@app.on_event("shutdown")
async def shutdown_event():
    await close_http_clients()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=(settings.ENVIRONMENT == "development")
    )

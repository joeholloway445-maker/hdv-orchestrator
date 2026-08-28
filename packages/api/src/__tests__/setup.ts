// Global test setup — sets env vars needed by auth middleware before any module loads
process.env.JWT_SECRET = "test-jwt-secret-for-integration-tests";
process.env.DATABASE_URL = "postgresql://test:test@localhost/test";

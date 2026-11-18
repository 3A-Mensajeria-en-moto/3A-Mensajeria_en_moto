// Se ejecuta antes de cargar la app: base en memoria, sin mails reales.
// Los tokens los firma el test con una clave propia (ver test/tokens.ts), no hace falta Keycloak.
process.env.DB_PATH = ':memory:';
process.env.KEYCLOAK_ISSUER = 'http://keycloak-de-test/realms/mensajeria';
process.env.KEYCLOAK_AUDIENCE = 'mensajeria-api';
process.env.SEED_DEMO = 'true';
process.env.SMTP_HOST = '';

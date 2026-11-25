// Solo se aplica al volumen nuevo de este servicio.
db.getSiblingDB('greenalert_analytics').createUser({
  user: 'analytics', pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: 'greenalert_analytics' }],
});

-- Se ejecuta solo la primera vez que se crea el volumen de la base.
-- Base aparte para `npm test` (las pruebas la borran en cada corrida).
CREATE DATABASE garweb_test OWNER garweb;

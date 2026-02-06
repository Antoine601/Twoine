/**
 * TWOINE - Models Index
 * Export centralisé de tous les modèles Mongoose
 */

const User = require('./User');
const Site = require('./Site');
const Service = require('./Service');
const Database = require('./Database');
const Domain = require('./Domain');
const { ServerStats, SiteStats, Alert, MonitoringConfig } = require('./Stats');

module.exports = {
    User,
    Site,
    Service,
    Database,
    Domain,
    ServerStats,
    SiteStats,
    Alert,
    MonitoringConfig,
};

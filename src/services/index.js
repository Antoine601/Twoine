/**
 * TWOINE - Services Index
 * Export centralisé de tous les services de gestion
 */

const { SystemdManager, systemdManager, validateServiceName } = require('./SystemdManager');
const { SiteManager, siteManager } = require('./SiteManager');
const { ServiceManager, serviceManager } = require('./ServiceManager');
const AuthService = require('./AuthService');
const { AuthError } = require('./AuthService');
const { FileManager, fileManager, TEXT_EXTENSIONS, DANGEROUS_EXTENSIONS } = require('./FileManager');
const { SftpManager, sftpManager } = require('./SftpManager');
const { DomainManager, domainManager } = require('./DomainManager');
const { SystemMonitor, systemMonitor } = require('./SystemMonitor');
const { StatsService, statsService } = require('./StatsService');
const { WebSocketService, webSocketService } = require('./WebSocketService');

module.exports = {
    // Classes
    SystemdManager,
    SiteManager,
    ServiceManager,
    AuthService,
    AuthError,
    FileManager,
    SftpManager,
    DomainManager,
    SystemMonitor,
    StatsService,
    WebSocketService,
    
    // Instances singleton
    systemdManager,
    siteManager,
    serviceManager,
    fileManager,
    sftpManager,
    domainManager,
    systemMonitor,
    statsService,
    webSocketService,
    
    // Utilitaires
    validateServiceName,
    TEXT_EXTENSIONS,
    DANGEROUS_EXTENSIONS,
};

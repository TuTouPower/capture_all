// devtools/devtools.ts
import { Logger } from '../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';

const logger = new Logger('devtools', get_app_log_transport());
logger.info('DevTools loaded');

chrome.devtools.panels.create(
    'Capture All',
    'assets/icons/icon48.png',
    'src/dashboard/dashboard.html',
);

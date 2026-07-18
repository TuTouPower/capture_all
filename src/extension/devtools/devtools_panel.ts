// devtools/devtools_panel.ts
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from '../background/app_log_storage';

const logger = new Logger('devtools/panel', get_app_log_transport());
logger.info('DevTools Panel loaded');

import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfigServer } from './app/app.config.server';

const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, appConfigServer, context);
export default bootstrap;

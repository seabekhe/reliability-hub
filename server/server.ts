import { createApp, analytics, genie, lakebase, server } from '@databricks/appkit';
import { setupReliabilityLakebaseRoutes } from './routes/lakebase/reliability-routes';
import { setupVolumeStateRoutes, useVolumeAppState } from './routes/app-state-routes';
import { setupEntitlementsRoutes } from './routes/entitlements-routes';

const volumeState = useVolumeAppState();

createApp({
  plugins: [
    analytics(),
    genie({ spaces: { reliability: process.env.DATABRICKS_GENIE_SPACE_ID ?? '' } }),
    ...(volumeState ? [] : [lakebase()]),
    server(),
  ],
  async onPluginsReady(appkit) {
    if (volumeState) {
      await setupVolumeStateRoutes((fn) => appkit.server.extend(fn));
    } else {
      await setupReliabilityLakebaseRoutes(appkit);
    }
    setupEntitlementsRoutes(appkit.server);
  },
}).catch(console.error);

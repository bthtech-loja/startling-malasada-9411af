import defaultConfig from '../defaultConfig.json';
import { StoreState } from '../types/store';

const adminDefaults = {
    "adminUsername": "bthtech",
    "adminPassword": "Juliano@2510",
};

const config = defaultConfig as Omit<StoreState, 'fiscal'> & {
  fiscal: Omit<StoreState['fiscal'], 'adminUsername' | 'adminPassword'>;
};

export const INITIAL_STORE_STATE: StoreState = {
  ...config,
  fiscal: { ...config.fiscal, ...adminDefaults },
  visual: {
    ...config.visual,
    flashSaleEndTime: config.visual.flashSaleEndTime || new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString(),
  },
};

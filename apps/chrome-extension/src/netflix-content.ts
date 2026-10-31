import { createNetflixAdapter } from '../../../packages/netflix-adapter/src/index';
import { installProviderContent } from './provider-content';

installProviderContent('netflix', '__netflixBridge', createNetflixAdapter);

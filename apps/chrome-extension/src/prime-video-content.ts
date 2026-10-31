import { createPrimeVideoAdapter } from '../../../packages/prime-video-adapter/src/index';
import { installProviderContent } from './provider-content';

installProviderContent('prime-video', '__primeVideoBridge', createPrimeVideoAdapter);

import { createYouTubeAdapter } from '../../../packages/youtube-adapter/src/index';
import { installProviderContent } from './provider-content';

installProviderContent('youtube', '__youtubeBridge', createYouTubeAdapter);

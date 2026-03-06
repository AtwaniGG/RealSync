import { Composition } from 'remotion';
import { RealSyncIntro, RealSyncReel } from './RealSyncIntro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="RealSyncIntro"
        component={RealSyncIntro}
        durationInFrames={1530}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="RealSyncReel"
        component={RealSyncReel}
        durationInFrames={1530}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};

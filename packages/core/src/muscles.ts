/** Muscle and motor-neuron groupings, from nematoduino's muscles.c. */

import { CELL_IDS as C } from './rom.ts';

const id = (name: string): number => {
  const v = C[name];
  if (v === undefined) throw new Error(`unknown cell ${name}`);
  return v;
};

export const LEFT_NECK_MUSCLE = ['MDL05','MDL06','MDL07','MDL08','MVL05','MVL06','MVL07','MVL08'].map(id);
export const RIGHT_NECK_MUSCLE = ['MDR05','MDR06','MDR07','MDR08','MVR05','MVR06','MVR07','MVR08'].map(id);

const bodyRange = ['09','10','11','12','13','14','15','16','17','18','19','20','21','22','23'];
export const LEFT_BODY_MUSCLE = [...bodyRange.map(n => `MDL${n}`), ...bodyRange.map(n => `MVL${n}`)].map(id);
export const RIGHT_BODY_MUSCLE = [...bodyRange.map(n => `MDR${n}`), ...bodyRange.map(n => `MVR${n}`)].map(id);

export const MOTOR_NEURON_A = [
  'DA1','DA2','DA3','DA4','DA5','DA6','DA7','DA8','DA9',
  'VA1','VA2','VA3','VA4','VA5','VA6','VA7','VA8','VA9','VA10','VA11','VA12',
].map(id);

/** Sensory neurons fired by a nose-touch (collision) stimulus. */
export const NOSE_TOUCH = [
  'FLPR','FLPL','ASHL','ASHR','IL1VL','IL1VR','OLQDL','OLQDR','OLQVR','OLQVL',
].map(id);

/** Sensory neurons fired by a chemotaxis (food) stimulus. */
export const CHEMOTAXIS = ['ADFL','ADFR','ASGR','ASGL','ASIL','ASIR','ASJR','ASJL'].map(id);

export const BODY_MUSCLES = 30;
export const NECK_MUSCLES = 8;
export const MOTOR_A = 21;

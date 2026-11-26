import { describe, expect, it } from 'vitest';
import { guessCv } from '../src/core/guess-cv';

const cvs = [
  { id: 'SAVED/Blazity_1-Senior', label: 'Blazity_cmuf1-Senior-Full-Stack' },
  { id: 'SAVED/TheSoftwareHouse_2-X', label: 'TheSoftwareHouse_cmub2-Senior-Fullstack' },
];

describe('guessCv', () => {
  it('picks the CV whose company is in the page title or host', () => {
    expect(guessCv(cvs, 'Senior Fullstack Developer', 'tsh.traffit.com')).toBeNull();
    expect(guessCv(cvs, 'Blazity — Mid Full Stack', 'blazity.traffit.com')).toBe(
      'SAVED/Blazity_1-Senior',
    );
    expect(guessCv(cvs, 'The Software House careers', 'tsh.traffit.com')).toBe(
      'SAVED/TheSoftwareHouse_2-X',
    );
  });

  it('chooses nothing when no company matches', () => {
    expect(guessCv(cvs, 'Some other employer', 'x.traffit.com')).toBeNull();
  });
});

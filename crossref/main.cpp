#include <cstdio>
#include <cstdlib>
#include "Worm.hpp"

// Reference driver: replay a fixed stimulus sequence and print muscle drive
// after every tick, so the TypeScript port can be diffed against the original C.
int main(int argc, char** argv) {
  const char* seq = argv[1];        // string of 'c' and 'n'
  Worm worm;
  for (const char* p = seq; *p; ++p) {
    if (*p == 'c') worm.chemotaxis(); else worm.noseTouch();
    printf("%d %d\n", worm.getLeftMuscle(), worm.getRightMuscle());
  }
  return 0;
}

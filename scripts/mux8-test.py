
from testvecutils import *

title = """
// Test vectors for 8-way combinational MUX

"""

# print header for a line:
def head():
    print "// DDDDDDDD SSS"
    print "// 01234567 210 Y"

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(D, S):
    y = (D >> (7-S)) & 1
    print "  ", bin(D, 8), bin(S, 3), lh(y, 1)


def doit():
    print title
    head()

    if 1:

        # Exhaustive test...
        for d in range(256):
            for s in range(8):
                trycase(d, s)

    else:
        # Emulate 3-bit constants on data inputs:
        d = 0xAA
        for s in range(8): trycase(d, s)
        d = 0xCC
        for s in range(8): trycase(d, s)
        d = 0xF0
        for s in range(8): trycase(d, s)



doit()


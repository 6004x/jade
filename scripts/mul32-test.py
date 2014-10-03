
from testvecutils import *

title = """
// Test vectors for 32-bit combinational multiplier

"""

# print header for a line:
def head():
    print "//", hd(" A[31:0] ", 32), hd(" B[31:0] ", 32), hd(" P[31:0] ", 32)

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(a, b):
    p = ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF
    print "  ", bin(a, 32), bin(b, 32), lh(p, 32)



def doit():
    print title
    head()

    # Make this 32 eventually... for now, it limits test cases to small numbers.
    m = 16

    # First, some simple (small number) cases:
    cases = [ 0, 1, 2, 3, 4, 5 ]
    for a in cases:
        for b in cases:
            trycase(a, b)

    # Then, try powers of 2:
    pow2 = [ 1<<i for i in range(32) ]
    for a in pow2:
        trycase(a, 0)
        trycase(a, 1)
        trycase(1, a)
        trycase(a, a)
        trycase(-1, a)
        trycase(a, -1)
doit()


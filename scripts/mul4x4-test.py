
from testvecutils import *

title = """
// Test vectors for 4x4 bit combinational multiplier, 8-bit product

"""

# print header for a line:
def head():
    print "//", hd("AAAA", 4), hd("BBBB", 4), hd(" P[7:0] ", 8)

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

def trycase(a, b):
    p = ((a & 0xF) * (b & 0xF)) & 0xFF
    print "  ", bin(a, 4), bin(b, 4), lh(p, 8)



def doit():
    print title
    head()

    # Make this 32 eventually... for now, it limits test cases to small numbers.
    m = 16

    for a in range(m):
        for b in range(m):
            trycase(a, b)

doit()


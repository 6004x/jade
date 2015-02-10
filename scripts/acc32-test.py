
from testvecutils import *

title = """
// Test vectors for 32-bit Accumulator

"""

# print header for a line:
def head():
    print "//", "L", "A"
    print "//", "D", "D",
    print hd(" D[31:0] ", 32), hd(" S[31:0] ", 32)

def bin(x, width):
    s = ""
    for i in range(width):
        s = str(x & 1) + s
        x >>= 1
    return s

S=0

def trycase(ld, ad, d):
    global S
    d = d & 0xFFFFFFFF
    if ld:
        S = d
    elif ad:
        S = (S + d) & 0xFFFFFFFF;
    print "  ", bin(ld, 1), bin(ad, 1), bin(d, 32), bin(S, 32)

def doit():
    print title
    head()
    mone = (1<<32)-1

    trycase(1, 0, 0)                    # set S to zero

    # then a few simple cases:
    trycase(0, 0, 0)

    trycase(0, 1, 0)
    trycase(0, 1, 1)
    trycase(0, 1, 2)
    trycase(0, 1, 3)

    for i in range(32+1):
        trycase(1, 0, 0)                # set S to zero
        trycase (0, 1, 1<<i)
        trycase (0, 1, 1<<i)
        trycase (0, 1, (1<<i) - 1)

doit()


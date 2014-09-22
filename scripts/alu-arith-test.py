
from testvecutils import *

title = """
// Test vectors for Beta ALU Arith subsystem

"""


# Some globals:


# print header for a line:
def head():

    # inputs:
    print "// ", hd("Fn", 2), hd(" A[31:0] ", 32), hd(" B[31:0] ", 32),

    # outputs:
    print hd(" Y[31:0] ", 32), "N", "V", "Z"



# Generate a test case.
# Args can be integer values, or '-' for undefined.
# Updates global PC to npc value.
def trycase(A, B, Fn):
    
    print "   ", bin(Fn, 2), bin(A, 32), bin(B, 32),
    
    if Fn == 0:                         # ADD
        Y = (A+B) & 0xFFFFFFFF
        XB = B

    elif Fn == 1:                    # SUB
        Y = (A - B) & 0xFFFFFFFF
        XB = -B
        

    elif Fn == 2:                    # MUL
        Y = (A * B) & 0xFFFFFFFF

    else:
        Y = -1

    # Compute N, V, Z:
    N = (Y >> 31) & 1
    V = (((A & XB & ~Y) | (~A & ~XB & Y)) >>31) & 1
    Z = 1 if Y == 0 else 0

    print lh(Y, 32), lh(N, 1), lh(V, 1), lh(Z, 1)


def doit():
    
    print title
    head()

    cmt("Try some ADDs:")
    cases = [0x0, 0x1, 0xFFFFFFFF, 0xFFFFFFFE];
    for a in cases:
        for b in cases:
            trycase(a, b, 0)

    cmt("Next some SUBs:")
    cases = [0x0, 0x1, 0xFFFFFFFF, 0xFFFFFFFE];
    for a in cases:
        for b in cases:
            trycase(a, b, 1)

doit()


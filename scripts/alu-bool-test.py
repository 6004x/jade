
from testvecutils import *

title = """
// Test vectors for Beta ALU Boolean subsystem

"""


# Some globals:


# print header for a line:
def head():

    # inputs:
    print "// ", hd("Fn", 4), hd(" A[31:0] ", 32), hd(" B[31:0] ", 32),

    # outputs:
    print hd(" Y[31:0] ", 32)



# Generate a test case.
# Args can be integer values, or '-' for undefined.
# Updates global PC to npc value.
def trycase(A, B, Fn):
    
    print "   ", bin(Fn, 4), bin(A, 32), bin(B, 32),
    
    # Bitwise boolean fn; Fn[3:0] is truth table:
    tt = Fn & 0xF
    Y = 0
    for bitno in range(32):
        index = ((A >> bitno) & 1) + (((B >> bitno) & 1) << 1)
        if (tt >> index) & 1: Y |= 1 << bitno

    print lh(Y, 32)


def doit():
    
    print title
    head()

    cases = [0x0, 0x1, 5, 0xFFFFFFFF, 0xFFFFFFFE];

    cmt("BOOLEAN tests: bitwise AND:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x8)

    cmt("BOOLEAN tests: bitwise OR:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0xE)

    cmt("BOOLEAN tests: bitwise XOR:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x6)

    cmt("BOOLEAN tests: bitwise A (first operand):")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0xA)

    cmt("Try each of the 16 functions, TTs from 0x0 thru 0xF:")
    for tt in range(16):
        trycase(0x55555555, 0x33333333, tt)

doit()


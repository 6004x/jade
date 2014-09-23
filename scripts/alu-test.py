
from testvecutils import *

title = """
// Test vectors for Beta ALU

"""


# Some globals:


# print header for a line:
def head():

    # inputs:
    print "// ", hd("Fn", 5), hd(" A[31:0] ", 32), hd(" B[31:0] ", 32),

    # outputs:
    print hd(" Y[31:0] ", 32)



# Generate a test case.
# Args can be integer values, or '-' for undefined.
# Updates global PC to npc value.
def trycase(A, B, Fn):
    
    print "   ", bin(Fn, 5), bin(A, 32), bin(B, 32),
    
    if Fn == 0:                         # ADD
        Y = (A + B) & 0xFFFFFFFF

    elif Fn == 1:                       # SUB
        Y = (A - B) & 0xFFFFFFFF

    elif Fn == 2:                       # MUL
        Y = (A * B) & 0xFFFFFFFF

    elif Fn == 5:                       # CMPEQ
        Y = 1 if (A & 0xFFFFFFFF) == (B & 0xFFFFFFFF) else 0

    elif Fn == 7:                       # CMPLT
        # Convert A, B to signed integers:
        if A & 0x80000000: A |= (-1 << 31) 
        if B & 0x80000000: B |= (-1 << 31) 
        Y = 1 if A < B else 0

    elif Fn == 13:                       # CMPLE
        # Convert A, B to signed integers:
        if A & 0x80000000: A |= (-1 << 31) 
        if B & 0x80000000: B |= (-1 << 31) 
        Y = 1 if A <= B else 0

    elif Fn == 8:                       # SHL
        Y = (A << (B & 0x1F)) & 0xFFFFFFFF

    elif Fn == 9:                       # SHR
        Y = (A & 0xFFFFFFFF) >> (B & 0x1F)

    elif Fn == 11:                       # SRA
        # Convert A to signed integer:
        if A & 0x80000000: A |= (-1 << 31) 
        Y = (A >> (B & 0x1F)) & 0xFFFFFFFF

    elif Fn & 0x10:
        # Bitwise boolean fn; Fn[4:0] is truth table:
        tt = Fn & 0xF
        Y = 0
        for bitno in range(32):
            index = ((A >> bitno) & 1) + (((B >> bitno) & 1) << 1)
            if (tt >> index) & 1: Y |= 1 << bitno

    else:
        Y = -1

    print lh(Y, 32)


def doit():
    
    print title
    head()

    cases = [0x0, 0x1, 5, 0xFFFFFFFF, 0xFFFFFFFE];


    cmt("Try some ADDs:")
    for a in cases:
        for b in cases:
            trycase(a, b, 0)

    cmt("Next some SUBs:")
    cases = [0x0, 0x1, 0xFFFFFFFF, 0xFFFFFFFE];
    for a in cases:
        for b in cases:
            trycase(a, b, 1)

    cmt("CMPEQ tests:")
    for a in cases:
        for b in cases:
            trycase(a, b, 5)
    
    cmt("CMPLT tests:")
    for a in cases:
        for b in cases:
            trycase(a, b, 7)
    
    cmt("CMPLE tests:")
    for a in cases:
        for b in cases:
            trycase(a, b, 13)
    
    cmt("SHL tests:")
    for a in [0, 0x55555555, 0xFFFFFFFF, 0xFFFF0000]:
        for b in [0, 1, 4, 16]:
            trycase(a, b, 8)

    cmt("SHR tests:")
    for a in [0, 0x55555555, 0xFFFFFFFF, 0xFFFF0000]:
        for b in [0, 1, 4, 16]:
            trycase(a, b, 9)

    cmt("SAR tests:")
    for a in [0, 0x55555555, 0xFFFFFFFF, 0xFFFF0000]:
        for b in [0, 1, 4, 16]:
            trycase(a, b, 11)

    cmt("BOOLEAN tests: bitwise AND:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x18)

    cmt("BOOLEAN tests: bitwise OR:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x1E)

    cmt("BOOLEAN tests: bitwise XOR:")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x16)

    cmt("BOOLEAN tests: bitwise A (first operand):")
    cases = [0, 0xAAAAAAAA, 0x55555555, 0xF0F0F0F0, 0xFFFFFFFF]
    for a in cases:
        for b in cases:
            trycase(a, b, 0x1A)


doit()


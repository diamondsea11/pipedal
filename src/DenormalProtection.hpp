// Copyright (c) 2026 Robin Davies
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
// the Software, and to permit persons to whom the Software is furnished to do so,
// subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
// FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
// IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// Flush-to-zero handling for the realtime audio thread.
//
// Why this is needed even though the build already passes -ffast-math:
//
// On x86, -ffast-math links crtfastmath.o, which sets the MXCSR flush-to-zero
// and denormals-are-zero bits in a startup constructor. But MXCSR is *per
// thread*, and the audio thread is created later via std::thread. It therefore
// cannot be relied on to inherit those bits, which is why audio applications
// generally set them explicitly on every audio thread rather than trusting the
// startup trick.
//
// The cost of getting this wrong is not subtle. When a reverb or delay tail
// decays below about 1e-38, the values become denormal and the CPU may fall
// back to microcoded handling -- historically one to two orders of magnitude
// slower for those operations. That shows up as xruns that appear seconds after
// you stop playing, which is a genuinely confusing symptom to chase.
//
// This matters far more on x86 than it did on the Pi: AArch64 NEON flushes
// denormals to zero unconditionally for most operations, so the Pi build was
// largely immune to the problem by accident of architecture.

#pragma once

#include <cstdint>

#if defined(__x86_64__) || defined(__i386__)
#include <pmmintrin.h>
#include <xmmintrin.h>
#endif

namespace pipedal
{
    // Call once at the start of every realtime audio thread, before processing
    // begins. Cheap (two register writes) and safe to call more than once.
    inline void EnableDenormalProtection()
    {
#if defined(__x86_64__) || defined(__i386__)
        _MM_SET_FLUSH_ZERO_MODE(_MM_FLUSH_ZERO_ON);
        // DAZ needs SSE3. Every x86-64 CPU PiPedal targets has it, and the
        // intrinsic compiles to a plain MXCSR write.
        _MM_SET_DENORMALS_ZERO_MODE(_MM_DENORMALS_ZERO_ON);
#elif defined(__aarch64__)
        // FPCR bit 24 (FZ). NEON already flushes for most operations, but the
        // scalar FP unit honours this bit, so set it for consistency.
        uint64_t fpcr;
        __asm__ __volatile__("mrs %0, fpcr" : "=r"(fpcr));
        fpcr |= (1ull << 24);
        __asm__ __volatile__("msr fpcr, %0" : : "r"(fpcr));
#endif
    }

} // namespace pipedal

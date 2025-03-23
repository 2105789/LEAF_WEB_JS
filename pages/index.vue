<template>
  <div class="min-h-screen bg-gradient-to-br from-teal-50 to-indigo-50">
    <!-- Hero Section -->
    <section class="relative overflow-hidden">
      <!-- Decorative Elements -->
      <div class="absolute -top-24 -right-24 w-96 h-96 bg-teal-100 rounded-full mix-blend-multiply filter blur-xl opacity-70"></div>
      <div class="absolute -bottom-24 -left-24 w-96 h-96 bg-indigo-100 rounded-full mix-blend-multiply filter blur-xl opacity-70"></div>
      
      <!-- Main Content -->
      <div class="container mx-auto px-6 py-16 relative z-10 ">
        <nav class="flex justify-between items-center mb-16">
          <div class="flex items-center">
            <img src="/logo.png" alt="LEAF Logo" class="h-10">
            <span class="ml-3 text-xl font-semibold text-gray-800">LEAF</span>
          </div>
          
          <div v-if="user" class="flex items-center gap-4">
            <nuxt-link to="/profile" class="text-gray-600 hover:text-teal-600 font-medium transition-colors">
              Profile
            </nuxt-link>
            <nuxt-link to="/chat" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-medium transition-colors">
              Go to Chat
            </nuxt-link>
          </div>
          <div v-else class="flex items-center gap-4">
            <nuxt-link to="/login" class="text-gray-600 hover:text-teal-600 font-medium transition-colors">
              Sign In
            </nuxt-link>
            <nuxt-link to="/signup" class="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md font-medium transition-colors">
              Get Started
            </nuxt-link>
          </div>
        </nav>
        
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div class="max-w-lg">
            <h1 class="text-4xl md:text-5xl font-bold text-gray-800 leading-tight mb-6 animate-fade-in">
              Enhance Your Workflow with <span class="text-teal-600">LEAF</span>
            </h1>
            <p class="text-xl text-gray-600 mb-8 animate-fade-in-delay">
              Your intelligent platform for seamless collaboration, document analysis, and knowledge sharing.
            </p>
            
            <div class="space-y-4 animate-fade-in-delay-2">
              <div v-if="user" class="bg-white rounded-xl shadow-lg p-6">
                <p class="text-xl font-medium text-gray-800 mb-4">
                  Welcome back, <span class="text-teal-600">{{ user.email }}</span>!
                </p>
                <div class="flex flex-wrap gap-4">
                  <nuxt-link 
                    to="/chat" 
                    class="px-6 py-3 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 hover:scale-[1.02]"
                  >
                    Continue to Chat
                  </nuxt-link>
                  <nuxt-link 
                    to="/profile" 
                    class="px-6 py-3 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
                  >
                    View Profile
                  </nuxt-link>
                  <button 
                    @click="handleLogout" 
                    class="px-6 py-3 border border-red-200 text-red-600 rounded-lg font-medium hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200"
                  >
                    Logout
                  </button>
                </div>
              </div>
              <div v-else class="flex flex-wrap gap-4">
                <nuxt-link 
                  to="/signup" 
                  class="px-8 py-4 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition-all duration-200 hover:scale-[1.02] shadow-md"
                >
                  Get Started Free
                </nuxt-link>
                <nuxt-link 
                  to="/login" 
                  class="px-8 py-4 border border-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all duration-200"
                >
                  Sign In
                </nuxt-link>
              </div>
            </div>
          </div>
          
          <div class="relative hidden lg:block">
            <div class="relative w-full h-[500px] rounded-2xl overflow-hidden transform transition-all duration-500 hover:scale-[1.02]">
              <img 
                src="/dashboard.svg" 
                alt="LEAF Chat Interface" 
                class="w-full h-full object-cover "
                onerror="this.onerror=null; this.src='https//placehold.co/800x600/e2f5f1/2dd4bf?text=LEAF+Chat+Interface&font=source-sans-pro'"
              >
            </div>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Features Section -->
    <section class="py-20 bg-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-gray-800 mb-4">Powerful Features</h2>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto">
            LEAF combines powerful AI with a seamless user experience to help you work smarter.
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Feature 1 -->
          <div class="bg-gray-50 rounded-xl p-8 transition-all duration-300 hover:shadow-lg">
            <div class="w-14 h-14 bg-teal-100 rounded-lg flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-teal-600" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">Intelligent Chat</h3>
            <p class="text-gray-600">
              Converse naturally with our AI assistant to get answers, generate content, and solve problems efficiently.
            </p>
          </div>
          
          <!-- Feature 2 -->
          <div class="bg-gray-50 rounded-xl p-8 transition-all duration-300 hover:shadow-lg">
            <div class="w-14 h-14 bg-indigo-100 rounded-lg flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-indigo-600" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">PDF Analysis</h3>
            <p class="text-gray-600">
              Upload and analyze documents instantly. Extract insights, summarize content, and get answers from your PDFs.
            </p>
          </div>
          
          <!-- Feature 3 -->
          <div class="bg-gray-50 rounded-xl p-8 transition-all duration-300 hover:shadow-lg">
            <div class="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">Web-Powered Data</h3>
            <p class="text-gray-600">
              Access the latest information with web search integration, staying updated with current data and trends.
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- How It Works Section -->
    <section class="py-20 bg-gray-50">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-gray-800 mb-4">How LEAF Works</h2>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto">
            Get started in minutes and transform your workflow
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <!-- Step 1 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-teal-600">1</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">Create Account</h3>
            <p class="text-gray-600">
              Sign up for free and set up your profile in seconds
            </p>
          </div>
          
          <!-- Step 2 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-teal-600">2</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">Start Chatting</h3>
            <p class="text-gray-600">
              Ask questions, upload documents, and get instant responses
            </p>
          </div>
          
          <!-- Step 3 -->
          <div class="text-center">
            <div class="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span class="text-2xl font-bold text-teal-600">3</span>
            </div>
            <h3 class="text-xl font-semibold text-gray-800 mb-3">Boost Productivity</h3>
            <p class="text-gray-600">
              Save time and make better decisions with AI-powered insights
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Testimonials Section -->
    <section class="py-20 bg-white">
      <div class="container mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-3xl font-bold text-gray-800 mb-4">What Our Users Say</h2>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto">
            Join thousands who use LEAF to transform their workflow
          </p>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <!-- Testimonial 1 -->
          <div class="bg-gray-50 rounded-xl p-8 shadow-sm">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center">
                <span class="text-lg font-bold text-teal-600">JP</span>
              </div>
              <div class="ml-4">
                <h4 class="font-semibold text-gray-800">Jennifer Parker</h4>
                <p class="text-gray-500 text-sm">Marketing Director</p>
              </div>
            </div>
            <p class="text-gray-600">
              "LEAF has completely transformed how our team analyzes market research documents. We've cut our research time in half."
            </p>
          </div>
          
          <!-- Testimonial 2 -->
          <div class="bg-gray-50 rounded-xl p-8 shadow-sm">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center">
                <span class="text-lg font-bold text-indigo-600">MR</span>
              </div>
              <div class="ml-4">
                <h4 class="font-semibold text-gray-800">Marcus Rodriguez</h4>
                <p class="text-gray-500 text-sm">Software Engineer</p>
              </div>
            </div>
            <p class="text-gray-600">
              "As a developer, I use LEAF daily to help me understand complex documentation and debug code. It's like having an expert by my side."
            </p>
          </div>
          
          <!-- Testimonial 3 -->
          <div class="bg-gray-50 rounded-xl p-8 shadow-sm">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <span class="text-lg font-bold text-purple-600">SJ</span>
              </div>
              <div class="ml-4">
                <h4 class="font-semibold text-gray-800">Sarah Johnson</h4>
                <p class="text-gray-500 text-sm">Research Analyst</p>
              </div>
            </div>
            <p class="text-gray-600">
              "The PDF analysis feature has been a game-changer for my research. I can extract insights from hundreds of pages in minutes."
            </p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- CTA Section -->
    <section class="py-20 bg-gradient-to-r from-teal-500 to-indigo-600 text-white">
      <div class="container mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold mb-6">Ready to Transform Your Workflow?</h2>
        <p class="text-xl max-w-2xl mx-auto mb-10 text-white/90">
          Join thousands of professionals who use LEAF to work smarter, not harder.
        </p>
        
        <div class="flex flex-wrap justify-center gap-4">
          <nuxt-link 
            to="/signup" 
            class="px-8 py-4 bg-white text-teal-600 rounded-lg font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-500 transition-all duration-200 hover:scale-[1.02] shadow-md"
          >
            Get Started Free
          </nuxt-link>
          <nuxt-link 
            to="/login" 
            class="px-8 py-4 border border-white text-white rounded-lg font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-teal-500 transition-all duration-200"
          >
            Sign In
          </nuxt-link>
        </div>
      </div>
    </section>
    
    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-12">
      <div class="container mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <span class="flex items-center mb-6">
              <img src="/logo.png" alt="LEAF Logo" class="h-8">
              <span class="ml-3 text-lg font-semibold">LEAF</span>
            </span>
          </div>
        </div>
        <p class="text-gray-400">
              Your intelligent collaboration platform powered by advanced AI.
            </p>
        <div class="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p class="text-gray-400 text-sm">© 2025 LEAF. All rights reserved.</p>
          <div class="flex space-x-6 mt-4 md:mt-0">
            <a href="https://www.linkedin.com/in/87nehal" class="text-gray-400 hover:text-white transition-colors">
              <span class="sr-only">LinkedIn</span>
              <svg class="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path fill-rule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clip-rule="evenodd" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
definePageMeta({
  middleware: 'public'
})

import { useAuth } from '~/composables/useAuth'

const { user, clearAuth } = useAuth()

const handleLogout = async () => {
  await clearAuth()
}
</script>

<style>
.animate-fade-in {
  animation: fadeIn 0.8s ease-out;
}

.animate-fade-in-delay {
  animation: fadeIn 0.8s ease-out 0.2s both;
}

.animate-fade-in-delay-2 {
  animation: fadeIn 0.8s ease-out 0.4s both;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
  
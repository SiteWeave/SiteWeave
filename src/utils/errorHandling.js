// Enhanced error handling utilities
export const handleApiError = (error, context = '') => {
  console.error(`API Error ${context}:`, error);
  
  let message = 'An unexpected error occurred';
  
  if (error.message) {
    message = error.message;
  } else if (error.error?.message) {
    message = error.error.message;
  } else if (typeof error === 'string') {
    message = error;
  }
  
  if (context) {
    message = `${context}: ${message}`;
  }
  
  return message;
};

export const retryRequest = async (requestFn, maxRetries = 3, delay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

export const isOnline = () => navigator.onLine;

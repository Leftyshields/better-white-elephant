/**
 * Party helper utilities for E2E tests
 * Creates test parties before running tests
 */

/**
 * Create a test party using Firebase
 * Note: This requires Firebase to be initialized and a user to be signed in
 * @param {Page} page - Playwright page object
 * @returns {Promise<string>} Party ID
 */
export async function createTestParty(page) {
  // Navigate to home page first
  await page.goto('/');
  
  // Check if user is signed in - if not, we may need to sign in first
  // For now, assume we're in a test environment where we can create parties
  // This might need Firebase Admin SDK or test user setup
  
  // Try to find and click "Create Party" button
  const createButton = page.getByRole('button', { name: /create.*party/i });
  
  if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createButton.click();
    
    // Fill in party form (if modal appears)
    const titleInput = page.getByLabel(/party.*title/i).first();
    if (await titleInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await titleInput.fill(`Test Party ${Date.now()}`);
    }
    
    const dateInput = page.getByLabel(/date/i).first();
    if (await dateInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await dateInput.fill(tomorrow.toISOString().split('T')[0]);
    }
    
    // Submit party creation
    const submitButton = page.getByRole('button', { name: /create|submit/i });
    if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await submitButton.click();
      
      // Wait for navigation to party page
      await page.waitForURL(/\/party\/[^/]+/, { timeout: 10000 });
      
      // Extract party ID from URL
      const url = page.url();
      const match = url.match(/\/party\/([^/?]+)/);
      if (match) {
        return match[1];
      }
    }
  }
  
  // Fallback: Create party directly via API if we have auth
  // This requires authentication setup in tests
  throw new Error('Could not create test party - authentication or UI not available');
}

/**
 * Create a test party via API endpoint (uses Firebase Admin SDK on backend)
 * @param {Page} page - Playwright page object (for accessing baseURL if needed)
 * @param {Object} options - Party creation options
 * @param {string} options.adminId - Optional admin user ID
 * @param {string} options.title - Optional party title
 * @param {string} options.date - Optional party date (ISO string)
 * @param {Object} options.config - Optional party config (maxSteals, returnToStart, priceLimit)
 * @returns {Promise<string>} Party ID
 */
export async function createTestPartyViaAPI(page, options = {}) {
  try {
    // Default to localhost:3001 for development server
    // In CI or other environments, this can be overridden via environment variable
    // or by setting it in Playwright config
    const serverUrl = process.env.TEST_SERVER_URL || 'http://localhost:3001';
    
    const response = await page.request.post(`${serverUrl}/api/test/party`, {
      data: options,
    });
    
    if (!response.ok()) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Failed to create test party: ${errorData.error || response.statusText()}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.partyId) {
      throw new Error(`Invalid response from test API: ${JSON.stringify(data)}`);
    }
    
    return data.partyId;
  } catch (error) {
    console.error('Error creating test party via API:', error);
    // Try fallback to UI automation if API fails
    console.warn('Falling back to UI-based party creation...');
    try {
      return await createTestParty(page);
    } catch (fallbackError) {
      throw new Error(`Test party creation failed (API and UI fallback): ${error.message} | ${fallbackError.message}`);
    }
  }
}

/**
 * Clean up test party after test
 * @param {Page} page - Playwright page object
 * @param {string} partyId - Party ID to delete
 */
export async function deleteTestParty(page, partyId) {
  // Navigate to party management
  // Click delete/remove party button
  // Or use Firebase Admin to delete
  
  // Placeholder - implementation depends on party deletion UI or API
  console.log(`Would delete party: ${partyId}`);
}

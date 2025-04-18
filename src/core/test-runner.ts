// src/core/test-runner.ts
import { DesktopUseClient, ApiError } from 'desktop-use';
import { TestCase, TestResult, TestStep } from '../models/test-case';

// Utility function for delays
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class TestRunner {
  private client: DesktopUseClient;
  private timeout: number;
  private retries: number;

  constructor(config: { timeout: number; retries: number }) {
    // Connect to the proper server URL (Terminator runs on port 9375 by default)
    this.client = new DesktopUseClient('http://127.0.0.1:9375');
    this.timeout = config.timeout;
    this.retries = config.retries;
    
    console.log('TestRunner initialized with desktop-use client - connected to server on port 9375');
  }

  async launchApp(appName: string): Promise<void> {
    try {
      // Convert common app names to their executable names
      let executableName = appName;
      if (appName.toLowerCase() === 'calculator') {
        executableName = 'calc'; // Use 'calc' instead of 'Calculator'
      }
      
      console.log(`Launching application: ${executableName}...`);
      await this.client.openApplication(executableName);
      console.log(`Successfully launched ${executableName}`);
      
      // Give the application time to initialize properly
      await sleep(2000);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`API error opening ${appName}: (${error.status}): ${error.message}`);
      } else {
        console.error(`Failed to launch ${appName}:`, error);
      }
      throw error;
    }
  }

  // Simplified locator method following the documentation pattern
  async findElement(selector: string) {
    try {
      // Use the locator method directly with the full selector string
      // Do not split the selector - the Terminator API expects the full "strategy:value" string
      return this.client.locator(selector);
    } catch (error) {
      console.error(`Error locating element with selector "${selector}":`, error);
      throw error;
    }
  }

  async clickElement(selector: string): Promise<void> {
    try {
      const element = await this.findElement(selector);
      await element.click();
    } catch (error) {
      console.error(`Error clicking element "${selector}":`, error);
      throw error;
    }
  }

  async typeText(selector: string, text: string): Promise<void> {
    try {
      const element = await this.findElement(selector);
      await element.typeText(text);
    } catch (error) {
      console.error(`Error typing text into "${selector}":`, error);
      throw error;
    }
  }

  async getText(selector: string): Promise<string> {
    try {
      const element = await this.findElement(selector);
      const result = await element.getText();
      // According to docs, getText returns an object with a text property
      return result.text;
    } catch (error) {
      console.error(`Error getting text from "${selector}":`, error);
      throw error;
    }
  }

  async verifyElementVisible(selector: string): Promise<boolean> {
    try {
      const element = await this.findElement(selector);
      return await element.isVisible();
    } catch (error) {
      console.error(`Error checking visibility of "${selector}":`, error);
      return false;
    }
  }

  async pressKey(selector: string, key: string): Promise<void> {
    try {
      const element = await this.findElement(selector);
      await element.pressKey(key);
    } catch (error) {
      console.error(`Error pressing key "${key}" on element "${selector}":`, error);
      throw error;
    }
  }

  async executeTestCase(testCase: TestCase): Promise<TestResult> {
    const result: TestResult = {
      testCase,
      status: 'PASS',
      startTime: new Date(),
      endTime: new Date(),
      duration: 0,
      steps: []
    };

    try {
      // Launch the application
      await this.launchApp(testCase.application);

      // Execute each step
      for (const step of testCase.steps) {
        try {
          await this.executeStep(step);
          result.steps.push({
            step,
            status: 'PASS'
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Step failed: ${step.description}. Error: ${errorMessage}`);
          
          result.steps.push({
            step,
            status: 'FAIL',
            error: errorMessage
          });
          
          result.status = 'FAIL';
          result.error = `Step failed: ${step.description}. Error: ${errorMessage}`;
          
          // Stop test execution after failure (can be made configurable)
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Test execution error: ${errorMessage}`);
      
      result.status = 'ERROR';
      result.error = `Test execution error: ${errorMessage}`;
    }

    result.endTime = new Date();
    result.duration = result.endTime.getTime() - result.startTime.getTime();
    return result;
  }

  private async executeStep(step: TestStep): Promise<void> {
    console.log(`Executing step: ${step.description}`);
    
    switch (step.action) {
      case 'click':
        if (!step.selector) {
          throw new Error(`Missing selector for click action in step: ${step.description}`);
        }
        await this.clickElement(step.selector);
        break;
        
      case 'type':
        if (!step.selector) {
          throw new Error(`Missing selector for type action in step: ${step.description}`);
        }
        if (!step.value) {
          throw new Error(`Missing value for type action in step: ${step.description}`);
        }
        await this.typeText(step.selector, step.value);
        break;
        
      case 'verify':
        if (!step.selector) {
          throw new Error(`Missing selector for verify action in step: ${step.description}`);
        }
        if (!step.value) {
          throw new Error(`Missing expected value for verify action in step: ${step.description}`);
        }
        const text = await this.getText(step.selector);
        if (!text.includes(step.value)) {
          throw new Error(`Verification failed. Expected text containing "${step.value}" but got "${text}"`);
        }
        break;
        
      case 'wait':
        const waitTime = step.value ? parseInt(step.value) : 1000;
        await sleep(waitTime);
        break;
        
      default:
        throw new Error(`Unknown step action: ${step.action}`);
    }
  }
}

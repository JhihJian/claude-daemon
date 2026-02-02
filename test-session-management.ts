#!/usr/bin/env bun
/**
 * test-session-management.ts
 * Test script for session management system
 */

import { SessionManager } from './daemon/session-manager.ts';
import { SessionStorage } from './lib/session-storage.ts';
import { SessionValidator } from './lib/session-validator.ts';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

console.log('🧪 Testing Session Management System\n');

async function runTests() {
  const testWorkspaceRoot = '/tmp/claude-session-test';
  let testSessionName = '';

  try {
    // Test 1: Initialize SessionManager
    console.log('Test 1: Initialize SessionManager');
    const manager = new SessionManager();
    console.log('✓ SessionManager initialized\n');

    // Test 2: List sessions (should be empty or show existing)
    console.log('Test 2: List existing sessions');
    const existingSessions = await manager.listSessions();
    console.log(`✓ Found ${existingSessions.length} existing sessions\n`);

    // Test 3: Validate session name
    console.log('Test 3: Validate session name');
    testSessionName = `test-session-${Date.now()}`;
    SessionValidator.validateSessionName(testSessionName);
    console.log(`✓ Session name validated: ${testSessionName}\n`);

    // Test 4: Create session with test agent
    console.log('Test 4: Create session with test agent');
    const sessionInfo = await manager.createSession({
      sessionName: testSessionName,
      agentName: 'test-agent',
      workspaceRoot: testWorkspaceRoot,
      environment: {
        TEST_VAR: 'test-value',
      },
    });
    console.log('✓ Session created successfully');
    console.log(`  Name: ${sessionInfo.sessionName}`);
    console.log(`  Agent: ${sessionInfo.agentName}`);
    console.log(`  Workspace: ${sessionInfo.workspacePath}`);
    console.log(`  Script: ${sessionInfo.scriptPath}\n`);

    // Test 5: Verify workspace structure
    console.log('Test 5: Verify workspace structure');
    const workspacePath = sessionInfo.workspacePath;
    const claudeDir = join(workspacePath, '.claude');
    const claudeMd = join(claudeDir, 'CLAUDE.md');
    const configJson = join(claudeDir, 'config.json');
    const envFile = join(claudeDir, '.env');

    if (!existsSync(workspacePath)) {
      throw new Error('Workspace directory not created');
    }
    if (!existsSync(claudeDir)) {
      throw new Error('.claude directory not created');
    }
    if (!existsSync(claudeMd)) {
      throw new Error('CLAUDE.md not copied');
    }
    if (!existsSync(configJson)) {
      throw new Error('config.json not copied');
    }
    if (!existsSync(envFile)) {
      throw new Error('.env file not created');
    }
    console.log('✓ Workspace structure verified\n');

    // Test 6: Verify launch script
    console.log('Test 6: Verify launch script');
    if (!existsSync(sessionInfo.scriptPath)) {
      throw new Error('Launch script not created');
    }
    console.log('✓ Launch script created\n');

    // Test 7: Get session info
    console.log('Test 7: Get session info');
    const retrievedSession = await manager.getSession(testSessionName);
    if (!retrievedSession) {
      throw new Error('Failed to retrieve session');
    }
    console.log('✓ Session info retrieved\n');

    // Test 8: List sessions (should include new session)
    console.log('Test 8: List sessions after creation');
    const sessionsAfterCreate = await manager.listSessions();
    const foundSession = sessionsAfterCreate.find(s => s.sessionName === testSessionName);
    if (!foundSession) {
      throw new Error('New session not found in list');
    }
    console.log(`✓ Session found in list (${sessionsAfterCreate.length} total sessions)\n`);

    // Test 9: Update last accessed
    console.log('Test 9: Update last accessed timestamp');
    const storage = new SessionStorage();
    await storage.updateLastAccessed(testSessionName);
    const updatedSession = await manager.getSession(testSessionName);
    if (updatedSession && updatedSession.lastAccessedAt === sessionInfo.lastAccessedAt) {
      throw new Error('Last accessed timestamp not updated');
    }
    console.log('✓ Last accessed timestamp updated\n');

    // Test 10: Delete session (without workspace)
    console.log('Test 10: Delete session (preserve workspace)');
    await manager.deleteSession(testSessionName, false);
    const deletedSession = await manager.getSession(testSessionName);
    if (deletedSession) {
      throw new Error('Session metadata not deleted');
    }
    if (!existsSync(workspacePath)) {
      throw new Error('Workspace was deleted when it should be preserved');
    }
    console.log('✓ Session deleted, workspace preserved\n');

    // Test 11: Clean up workspace
    console.log('Test 11: Clean up test workspace');
    if (existsSync(workspacePath)) {
      rmSync(workspacePath, { recursive: true, force: true });
    }
    console.log('✓ Test workspace cleaned up\n');

    // Test 12: Create and delete with workspace
    console.log('Test 12: Create and delete session with workspace');
    const testSessionName2 = `test-session-${Date.now()}-2`;
    const sessionInfo2 = await manager.createSession({
      sessionName: testSessionName2,
      agentName: 'test-agent',
      workspaceRoot: testWorkspaceRoot,
    });
    await manager.deleteSession(testSessionName2, true);
    if (existsSync(sessionInfo2.workspacePath)) {
      throw new Error('Workspace not deleted');
    }
    console.log('✓ Session and workspace deleted\n');

    // Test 13: Validation errors
    console.log('Test 13: Test validation errors');
    try {
      SessionValidator.validateSessionName('invalid name with spaces');
      throw new Error('Should have thrown validation error');
    } catch (error) {
      if (error instanceof Error && error.name === 'ValidationError') {
        console.log('✓ Validation error caught correctly\n');
      } else {
        throw error;
      }
    }

    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }

    // Clean up on failure
    if (testSessionName) {
      try {
        const manager = new SessionManager();
        const session = await manager.getSession(testSessionName);
        if (session) {
          await manager.deleteSession(testSessionName, true);
        }
      } catch (cleanupError) {
        console.error('Failed to clean up test session:', cleanupError);
      }
    }

    process.exit(1);
  } finally {
    // Clean up test workspace root
    if (existsSync(testWorkspaceRoot)) {
      rmSync(testWorkspaceRoot, { recursive: true, force: true });
    }
  }
}

runTests();

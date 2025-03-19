#!/usr/bin/env python
"""
Script to cleanup tool notification calls.
This will replace direct 'completed' status notifications with the helper function.
"""
import os
import re
import glob

# Root directory for tools
TOOLS_DIR = "backend/tools"

def cleanup_tool_file(filepath):
    """Update a single tool file to use the new completion helper."""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Skip if it doesn't have any completed status calls
    if 'status="completed"' not in content and "status='completed'" not in content:
        print(f"Skipping {filepath} - no cleanup needed")
        return
    
    print(f"Cleaning up {filepath}")
    
    # Find tool names in the file from various patterns
    tool_pattern = re.compile(r'await send_tool_notification\(context, "([^"]+)"')
    tool_names = tool_pattern.findall(content)
    
    if not tool_names:
        print(f"  Warning: Could not find tool name in {filepath}")
        return
    
    tool_name = tool_names[0]  # Use the first one found
    print(f"  Found tool: {tool_name}")
    
    # Add the import for the completion helper if needed
    if "send_tool_completion_notification" not in content:
        if "from .utils import log, send_tool_notification" in content:
            content = content.replace(
                "from .utils import log, send_tool_notification",
                "from .utils import log, send_tool_notification, send_tool_completion_notification"
            )
    
    # Pattern 1: Replace context extraction + completed notification
    content = re.sub(
        r'context = getattr\(wrapper, \'context\', {}\)\s+await send_tool_notification\(context, "([^"]+)", "completed"\)', 
        r'await send_tool_completion_notification(wrapper, "\1")', 
        content
    )
    
    # Pattern 2: Replace direct completed notifications
    content = re.sub(
        r'await send_tool_notification\(context, "([^"]+)", "completed"\)', 
        r'await send_tool_completion_notification(wrapper, "\1")', 
        content
    )
    
    # Write back the updated content
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"  Updated {filepath}")

def main():
    """Main function to cleanup tool files."""
    print("Cleaning up tool notification patterns in all tool files...")
    
    # Find all Python files in the tools directory
    tool_files = glob.glob(f"{TOOLS_DIR}/*.py")
    
    # Skip the utils file
    tool_files = [f for f in tool_files if not f.endswith('utils.py')]
    
    # Update each file
    updated_count = 0
    for filepath in tool_files:
        cleanup_tool_file(filepath)
        updated_count += 1
    
    print(f"Processed {updated_count} tool files.")

if __name__ == "__main__":
    main() 
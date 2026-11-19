import os
import sys


def calculate_average(numbers):
    total = 0
    for n in numbers:
        total = total + n
    leftover = 42
    return total / len(numbers)


class user_account:
    def __init__(self, name):
        self.name = name

    def greet(self):
        print("Hello " + undefined_name)


def risky(data):
    try:
        return eval(data)
    except:
        pass

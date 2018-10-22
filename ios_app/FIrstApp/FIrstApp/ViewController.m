//
//  ViewController.m
//  FIrstApp
//
//  Created by 张双俊 on 2018/8/21.
//  Copyright © 2018年 张双俊. All rights reserved.
//

#import "ViewController.h"
@interface ViewController ()

@end

@implementation ViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do any additional setup after loading the view, typically from a nib.
    IndexViewController *indexViewCtr = [[IndexViewController alloc] initWithNibName:@"IndexViewController" bundle:(nil)];
    
    UIView *indexView = indexViewCtr.view;
    [self.view addSubview:indexView];
}


- (void)didReceiveMemoryWarning {
    [super didReceiveMemoryWarning];
    // Dispose of any resources that can be recreated.
}


@end
